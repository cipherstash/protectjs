import { loadStashConfig } from '@/config/index.js'
import { runBackfill } from '@cipherstash/migrate'
import * as p from '@clack/prompts'
import pg from 'pg'
import { loadEncryptionContext, requireTable } from './context.js'

export interface BackfillCommandOptions {
  table: string
  column: string
  pkColumn?: string
  chunkSize?: number
  encryptedColumn?: string
  schemaColumnKey?: string
}

export async function backfillCommand(options: BackfillCommandOptions) {
  p.intro('npx @cipherstash/cli encrypt backfill')

  const stashConfig = await loadStashConfig()
  const ctx = await loadEncryptionContext()
  const tableSchema = requireTable(ctx, options.table)

  const pool = new pg.Pool({
    connectionString: stashConfig.databaseUrl,
    max: 2,
  })

  const controller = new AbortController()
  const onSignal = () => {
    p.log.warn('Interrupt received; finishing current chunk and exiting.')
    controller.abort()
  }
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)

  const db = await pool.connect()
  try {
    const pkColumn =
      options.pkColumn ?? (await detectPkColumn(db, options.table))

    const plaintextColumn = options.column
    const encryptedColumn =
      options.encryptedColumn ?? `${options.column}_encrypted`
    const schemaColumnKey = options.schemaColumnKey ?? options.column

    p.log.info(
      `Backfilling ${options.table}.${plaintextColumn} → ${encryptedColumn} (pk: ${pkColumn}, chunk: ${options.chunkSize ?? 1000}).`,
    )

    let lastLogged = 0
    const result = await runBackfill({
      db,
      encryptionClient: ctx.client as unknown as Parameters<
        typeof runBackfill
      >[0]['encryptionClient'],
      tableSchema,
      tableName: options.table,
      schemaColumnKey,
      plaintextColumn,
      encryptedColumn,
      pkColumn,
      chunkSize: options.chunkSize,
      signal: controller.signal,
      onProgress: (progress) => {
        if (
          progress.rowsProcessed - lastLogged >= 5000 ||
          progress.rowsProcessed === progress.rowsTotal
        ) {
          p.log.step(
            `${progress.rowsProcessed.toLocaleString()}/${progress.rowsTotal.toLocaleString()} rows`,
          )
          lastLogged = progress.rowsProcessed
        }
      },
    })

    if (!result.completed) {
      p.log.warn(
        `Stopped before completion. ${result.rowsProcessed.toLocaleString()} rows processed. Re-run to resume.`,
      )
      p.outro('Paused.')
      return
    }

    p.outro(
      `Backfill complete. ${result.rowsProcessed.toLocaleString()} rows encrypted.`,
    )
  } catch (error) {
    p.log.error(error instanceof Error ? error.message : 'Backfill failed.')
    process.exit(1)
  } finally {
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
    db.release()
    await pool.end()
  }
}

async function detectPkColumn(
  db: pg.PoolClient,
  tableName: string,
): Promise<string> {
  const [schema, table] = tableName.includes('.')
    ? tableName.split('.')
    : [null, tableName]

  const result = await db.query<{ column_name: string }>(
    `SELECT a.attname AS column_name
     FROM pg_index i
     JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
     JOIN pg_class c ON c.oid = i.indrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE i.indisprimary
       AND c.relname = $1
       AND ($2::text IS NULL OR n.nspname = $2)
     ORDER BY a.attnum ASC`,
    [table, schema],
  )

  if (result.rows.length === 0) {
    throw new Error(
      `Could not detect a primary key on ${tableName}. Pass --pk-column <name>.`,
    )
  }
  if (result.rows.length > 1) {
    throw new Error(
      `${tableName} has a composite primary key; composite keys are not yet supported. Pass --pk-column <name> to override.`,
    )
  }
  return result.rows[0]?.column_name
}
