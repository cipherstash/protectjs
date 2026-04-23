import type { ClientBase } from 'pg'

export type MigrationEvent =
  | 'schema_added'
  | 'dual_writing'
  | 'backfill_started'
  | 'backfill_checkpoint'
  | 'backfilled'
  | 'cut_over'
  | 'dropped'
  | 'error'

export type MigrationPhase =
  | 'schema-added'
  | 'dual-writing'
  | 'backfilling'
  | 'backfilled'
  | 'cut-over'
  | 'dropped'

export type ColumnKey = `${string}.${string}`

export interface MigrationStateRow {
  id: string
  tableName: string
  columnName: string
  event: MigrationEvent
  phase: MigrationPhase
  cursorValue: string | null
  rowsProcessed: number | null
  rowsTotal: number | null
  details: Record<string, unknown> | null
  createdAt: Date
}

export interface AppendEventInput {
  tableName: string
  columnName: string
  event: MigrationEvent
  phase: MigrationPhase
  cursorValue?: string | null
  rowsProcessed?: number | null
  rowsTotal?: number | null
  details?: Record<string, unknown> | null
}

export async function appendEvent(
  client: ClientBase,
  input: AppendEventInput,
): Promise<MigrationStateRow> {
  const result = await client.query(
    `INSERT INTO cipherstash.cs_migrations
      (table_name, column_name, event, phase, cursor_value, rows_processed, rows_total, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, table_name, column_name, event, phase, cursor_value, rows_processed, rows_total, details, created_at`,
    [
      input.tableName,
      input.columnName,
      input.event,
      input.phase,
      input.cursorValue ?? null,
      input.rowsProcessed ?? null,
      input.rowsTotal ?? null,
      input.details ?? null,
    ],
  )
  return rowToState(result.rows[0])
}

export async function latestByColumn(
  client: ClientBase,
): Promise<Map<ColumnKey, MigrationStateRow>> {
  const result = await client.query(
    `SELECT DISTINCT ON (table_name, column_name)
       id, table_name, column_name, event, phase, cursor_value, rows_processed, rows_total, details, created_at
     FROM cipherstash.cs_migrations
     ORDER BY table_name, column_name, id DESC`,
  )
  const map = new Map<ColumnKey, MigrationStateRow>()
  for (const row of result.rows) {
    const state = rowToState(row)
    map.set(`${state.tableName}.${state.columnName}`, state)
  }
  return map
}

export async function progress(
  client: ClientBase,
  tableName: string,
  columnName: string,
): Promise<MigrationStateRow | null> {
  const result = await client.query(
    `SELECT id, table_name, column_name, event, phase, cursor_value, rows_processed, rows_total, details, created_at
     FROM cipherstash.cs_migrations
     WHERE table_name = $1 AND column_name = $2
     ORDER BY id DESC
     LIMIT 1`,
    [tableName, columnName],
  )
  if (result.rows.length === 0) return null
  return rowToState(result.rows[0])
}

function rowToState(row: {
  id: string | number
  table_name: string
  column_name: string
  event: MigrationEvent
  phase: MigrationPhase
  cursor_value: string | null
  rows_processed: string | number | null
  rows_total: string | number | null
  details: Record<string, unknown> | null
  created_at: Date
}): MigrationStateRow {
  return {
    id: String(row.id),
    tableName: row.table_name,
    columnName: row.column_name,
    event: row.event,
    phase: row.phase,
    cursorValue: row.cursor_value,
    rowsProcessed:
      row.rows_processed === null ? null : Number(row.rows_processed),
    rowsTotal: row.rows_total === null ? null : Number(row.rows_total),
    details: row.details,
    createdAt: row.created_at,
  }
}
