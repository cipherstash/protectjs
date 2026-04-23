import type { ClientBase } from 'pg'
import { quoteIdent } from './sql.js'

export interface KeysetPageOptions {
  tableName: string
  pkColumn: string
  plaintextColumn: string
  encryptedColumn: string
  after: string | null
  limit: number
}

export interface KeysetPage<Row = Record<string, unknown>> {
  rows: Row[]
  lastPk: string | null
}

/**
 * Fetch the next page of rows that still need encryption for a given column.
 * Guards with `encrypted_col IS NULL AND plaintext_col IS NOT NULL` so a
 * concurrent backfill or a re-run never re-processes the same row.
 */
export async function fetchUnencryptedPage(
  client: ClientBase,
  opts: KeysetPageOptions,
): Promise<KeysetPage<{ pk: string; plaintext: unknown }>> {
  const pk = quoteIdent(opts.pkColumn)
  const plain = quoteIdent(opts.plaintextColumn)
  const enc = quoteIdent(opts.encryptedColumn)
  const table = qualifyTable(opts.tableName)

  const params: unknown[] = []
  let where = `${plain} IS NOT NULL AND ${enc} IS NULL`
  if (opts.after !== null) {
    params.push(opts.after)
    where += ` AND ${pk} > $${params.length}`
  }
  params.push(opts.limit)
  const limitParam = `$${params.length}`

  const sql = `
    SELECT ${pk}::text AS pk, ${plain} AS plaintext
    FROM ${table}
    WHERE ${where}
    ORDER BY ${pk} ASC
    LIMIT ${limitParam}
  `
  const result = await client.query<{ pk: string; plaintext: unknown }>(
    sql,
    params,
  )
  const rows = result.rows
  const lastPk = rows.length > 0 ? rows[rows.length - 1]?.pk : null
  return { rows, lastPk }
}

export async function countUnencrypted(
  client: ClientBase,
  tableName: string,
  plaintextColumn: string,
  encryptedColumn: string,
): Promise<number> {
  const plain = quoteIdent(plaintextColumn)
  const enc = quoteIdent(encryptedColumn)
  const table = qualifyTable(tableName)
  const result = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM ${table} WHERE ${plain} IS NOT NULL AND ${enc} IS NULL`,
  )
  return Number(result.rows[0]?.count ?? 0)
}

export function qualifyTable(tableName: string): string {
  if (tableName.includes('.')) {
    const parts = tableName.split('.')
    return parts.map(quoteIdent).join('.')
  }
  return quoteIdent(tableName)
}
