import type { ClientBase } from 'pg'

export interface PendingColumn {
  tableName: string
  columnName: string
}

export async function selectPendingColumns(
  client: ClientBase,
): Promise<PendingColumn[]> {
  const result = await client.query<{
    table_name: string
    column_name: string
  }>('SELECT table_name, column_name FROM eql_v2.select_pending_columns()')
  return result.rows.map((row) => ({
    tableName: row.table_name,
    columnName: row.column_name,
  }))
}

export async function readyForEncryption(client: ClientBase): Promise<boolean> {
  const result = await client.query<{ ready: boolean }>(
    'SELECT eql_v2.ready_for_encryption() AS ready',
  )
  return result.rows[0]?.ready === true
}

export async function renameEncryptedColumns(
  client: ClientBase,
): Promise<void> {
  await client.query('SELECT eql_v2.rename_encrypted_columns()')
}

export async function reloadConfig(client: ClientBase): Promise<void> {
  await client.query('SELECT eql_v2.reload_config()')
}

export async function countEncryptedWithActiveConfig(
  client: ClientBase,
  tableName: string,
  columnName: string,
): Promise<number> {
  const result = await client.query<{ count: string }>(
    'SELECT eql_v2.count_encrypted_with_active_config($1, $2) AS count',
    [tableName, columnName],
  )
  return Number(result.rows[0]?.count ?? 0)
}
