import type { ClientBase, PoolClient } from 'pg'
import {
  countUnencrypted,
  fetchUnencryptedPage,
  qualifyTable,
} from './cursor.js'
import { quoteIdent } from './sql.js'
import { type MigrationPhase, appendEvent, progress } from './state.js'

// Loose structural types — keep this library decoupled from @cipherstash/stack
// so it can be built and tested without pulling the full stack graph in.
export interface BulkEncryptResultSuccess<T> {
  failure?: undefined
  data: T[]
}
export interface BulkEncryptResultFailure {
  failure: { message: string; type?: string }
  data?: undefined
}
export type BulkEncryptResult<T> =
  | BulkEncryptResultSuccess<T>
  | BulkEncryptResultFailure

export type BulkEncryptThenable<T> = PromiseLike<BulkEncryptResult<T>>

export interface EncryptionClientLike {
  bulkEncryptModels(
    input: Array<Record<string, unknown>>,
    // biome-ignore lint/suspicious/noExplicitAny: Stack's EncryptedTable is generic
    table: any,
  ): BulkEncryptThenable<Record<string, unknown>>
}

export interface BackfillProgress {
  rowsProcessed: number
  rowsTotal: number
  lastPk: string | null
  chunkSize: number
  chunkIndex: number
}

export interface BackfillOptions {
  /** A connection from the pool we can run transactions on. */
  db: PoolClient
  /** User's initialised encryption client. Must expose `bulkEncryptModels`. */
  encryptionClient: EncryptionClientLike
  /** The stack EncryptedTable schema for the target table. */
  // biome-ignore lint/suspicious/noExplicitAny: Stack's EncryptedTable is generic
  tableSchema: any
  /** Physical table name. Supports `schema.table`. */
  tableName: string
  /** Logical column key inside `tableSchema`. */
  schemaColumnKey: string
  /** Physical plaintext column, e.g. `email`. */
  plaintextColumn: string
  /** Physical encrypted column, e.g. `email_encrypted`. */
  encryptedColumn: string
  /** Physical primary-key column; must be single-column, comparable with `>`. */
  pkColumn: string
  /** Rows per chunk. Default 1000. */
  chunkSize?: number
  /** AbortSignal — if aborted between chunks, the backfill exits cleanly. */
  signal?: AbortSignal
  /** Called after each successful chunk commit. */
  onProgress?: (progress: BackfillProgress) => void
}

export interface BackfillResult {
  resumed: boolean
  rowsProcessed: number
  rowsTotal: number
  completed: boolean
}

/**
 * Run a chunked, resumable, idempotent backfill of plaintext → encrypted.
 *
 * Per chunk, in a single transaction: select next page → encrypt via client
 * → UPDATE … FROM (VALUES …) → INSERT checkpoint event. The `encrypted IS
 * NULL` guard and the monotonic PK cursor make re-runs safe even if a chunk
 * partially completes and is retried.
 */
export async function runBackfill(
  options: BackfillOptions,
): Promise<BackfillResult> {
  const chunkSize = options.chunkSize ?? 1000
  const { db, tableName, pkColumn, plaintextColumn, encryptedColumn } = options

  const rowsTotal = await countUnencrypted(
    db,
    tableName,
    plaintextColumn,
    encryptedColumn,
  )

  const last = await progress(db, tableName, plaintextColumn)
  const resumeCursor =
    last?.event === 'backfill_checkpoint' ? last.cursorValue : null
  const resumed = resumeCursor !== null
  const priorProcessed =
    last?.event === 'backfill_checkpoint' ? (last.rowsProcessed ?? 0) : 0

  await appendEvent(db, {
    tableName,
    columnName: plaintextColumn,
    event: 'backfill_started',
    phase: 'backfilling',
    cursorValue: resumeCursor,
    rowsProcessed: priorProcessed,
    rowsTotal: priorProcessed + rowsTotal,
    details: { chunkSize, resumed },
  })

  let cursor = resumeCursor
  let rowsProcessed = priorProcessed
  const rowsTotalWithResumed = priorProcessed + rowsTotal
  let chunkIndex = 0
  let completed = false

  try {
    while (true) {
      if (options.signal?.aborted) break

      const page = await fetchUnencryptedPage(db, {
        tableName,
        pkColumn,
        plaintextColumn,
        encryptedColumn,
        after: cursor,
        limit: chunkSize,
      })

      if (page.rows.length === 0) {
        completed = true
        break
      }

      const models = page.rows.map((row) => ({
        __pk: row.pk,
        [options.schemaColumnKey]: row.plaintext,
      }))

      const encryptResult = await options.encryptionClient.bulkEncryptModels(
        models,
        options.tableSchema,
      )

      if (encryptResult.failure) {
        throw new Error(
          `bulkEncryptModels failed: ${encryptResult.failure.message}`,
        )
      }

      await db.query('BEGIN')
      try {
        await writeEncryptedChunk(db, {
          tableName,
          pkColumn,
          encryptedColumn,
          schemaColumnKey: options.schemaColumnKey,
          encryptedRows: encryptResult.data,
        })
        rowsProcessed += page.rows.length
        cursor = page.lastPk
        await appendEvent(db, {
          tableName,
          columnName: plaintextColumn,
          event: 'backfill_checkpoint',
          phase: 'backfilling',
          cursorValue: cursor,
          rowsProcessed,
          rowsTotal: rowsTotalWithResumed,
          details: { chunkIndex, chunkRows: page.rows.length },
        })
        await db.query('COMMIT')
      } catch (err) {
        await db.query('ROLLBACK').catch(() => {})
        throw err
      }

      options.onProgress?.({
        rowsProcessed,
        rowsTotal: rowsTotalWithResumed,
        lastPk: cursor,
        chunkSize,
        chunkIndex,
      })
      chunkIndex += 1
    }

    if (completed) {
      await appendEvent(db, {
        tableName,
        columnName: plaintextColumn,
        event: 'backfilled',
        phase: 'backfilled',
        cursorValue: cursor,
        rowsProcessed,
        rowsTotal: rowsTotalWithResumed,
        details: { chunkCount: chunkIndex },
      })
    }
  } catch (err) {
    await appendEvent(db, {
      tableName,
      columnName: plaintextColumn,
      event: 'error',
      phase: 'backfilling',
      cursorValue: cursor,
      rowsProcessed,
      rowsTotal: rowsTotalWithResumed,
      details: {
        message: err instanceof Error ? err.message : String(err),
        chunkIndex,
      },
    })
    throw err
  }

  return {
    resumed,
    rowsProcessed,
    rowsTotal: rowsTotalWithResumed,
    completed,
  }
}

interface WriteChunkOptions {
  tableName: string
  pkColumn: string
  encryptedColumn: string
  schemaColumnKey: string
  encryptedRows: Array<Record<string, unknown>>
}

async function writeEncryptedChunk(
  db: ClientBase,
  opts: WriteChunkOptions,
): Promise<void> {
  if (opts.encryptedRows.length === 0) return

  const table = qualifyTable(opts.tableName)
  const pk = quoteIdent(opts.pkColumn)
  const enc = quoteIdent(opts.encryptedColumn)

  const params: unknown[] = []
  const valuesSql = opts.encryptedRows
    .map((row) => {
      const pkValue = row.__pk
      const encryptedValue = row[opts.schemaColumnKey]
      params.push(pkValue)
      const pkParam = `$${params.length}`
      params.push(encryptedValue)
      const encParam = `$${params.length}::jsonb`
      return `(${pkParam}, ${encParam})`
    })
    .join(', ')

  const sql = `
    UPDATE ${table} AS t
    SET ${enc} = v.enc
    FROM (VALUES ${valuesSql}) AS v(pk, enc)
    WHERE t.${pk}::text = v.pk::text AND t.${enc} IS NULL
  `

  await db.query(sql, params)
}
