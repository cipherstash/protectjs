import * as p from '@clack/prompts'
import pg from 'pg'
import type { ColumnDef, DataType, SchemaDef, SearchOp } from '../types.js'

export interface DbColumn {
  columnName: string
  dataType: string
  udtName: string
  isEqlEncrypted: boolean
}

export interface DbTable {
  tableName: string
  columns: DbColumn[]
}

/**
 * Map a Postgres `udt_name` (e.g. `int4`, `timestamptz`) onto the CipherStash
 * `DataType` taxonomy. Anything we can't classify falls back to `string`,
 * which is the safest "treat the value as opaque text" default.
 */
export function pgTypeToDataType(udtName: string): DataType {
  switch (udtName) {
    case 'int2':
    case 'int4':
    case 'int8':
    case 'float4':
    case 'float8':
    case 'numeric':
      return 'number'
    case 'bool':
      return 'boolean'
    case 'date':
    case 'timestamp':
    case 'timestamptz':
      return 'date'
    case 'json':
    case 'jsonb':
      return 'json'
    default:
      return 'string'
  }
}

/**
 * Read every base table in the `public` schema along with its columns.
 *
 * The `eql_v2_encrypted` UDT marker tells us a column is already managed by
 * CipherStash — useful for re-runs against a partially set up DB so we can
 * pre-select those columns rather than asking the user to reconfirm.
 */
export async function introspectDatabase(
  databaseUrl: string,
): Promise<DbTable[]> {
  const client = new pg.Client({ connectionString: databaseUrl })
  try {
    await client.connect()

    const { rows } = await client.query<{
      table_name: string
      column_name: string
      data_type: string
      udt_name: string
    }>(`
      SELECT c.table_name, c.column_name, c.data_type, c.udt_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_name = c.table_name AND t.table_schema = c.table_schema
      WHERE c.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
      ORDER BY c.table_name, c.ordinal_position
    `)

    const tableMap = new Map<string, DbColumn[]>()
    for (const row of rows) {
      const cols = tableMap.get(row.table_name) ?? []
      cols.push({
        columnName: row.column_name,
        dataType: row.data_type,
        udtName: row.udt_name,
        isEqlEncrypted: row.udt_name === 'eql_v2_encrypted',
      })
      tableMap.set(row.table_name, cols)
    }

    return Array.from(tableMap.entries()).map(([tableName, columns]) => ({
      tableName,
      columns,
    }))
  } finally {
    await client.end()
  }
}

function allSearchOps(dataType: DataType): SearchOp[] {
  const ops: SearchOp[] = ['equality', 'orderAndRange']
  if (dataType === 'string') {
    ops.push('freeTextSearch')
  }
  return ops
}

/**
 * Interactive multi-select: which columns in which table should be encrypted?
 *
 * Returns `undefined` if the user cancels at any prompt — callers should
 * propagate the cancellation rather than treating it as "no columns selected".
 *
 * Pre-selects columns that are already `eql_v2_encrypted` so re-running on a
 * partially encrypted DB is a no-op by default.
 */
export async function selectTableColumns(
  tables: DbTable[],
): Promise<SchemaDef | undefined> {
  const selectedTable = await p.select({
    message: 'Which table do you want to encrypt columns in?',
    options: tables.map((t) => {
      const eqlCount = t.columns.filter((c) => c.isEqlEncrypted).length
      const hint =
        eqlCount > 0
          ? `${t.columns.length} columns, ${eqlCount} already encrypted`
          : `${t.columns.length} column${t.columns.length !== 1 ? 's' : ''}`
      return { value: t.tableName, label: t.tableName, hint }
    }),
  })

  if (p.isCancel(selectedTable)) return undefined

  const table = tables.find((t) => t.tableName === selectedTable)
  if (!table) return undefined

  const eqlColumns = table.columns.filter((c) => c.isEqlEncrypted)

  if (eqlColumns.length > 0) {
    p.log.info(
      `Detected ${eqlColumns.length} column${eqlColumns.length !== 1 ? 's' : ''} with eql_v2_encrypted type — pre-selected for you.`,
    )
  }

  const selectedColumns = await p.multiselect({
    message: `Which columns in "${selectedTable}" should be in the encryption schema?`,
    options: table.columns.map((col) => ({
      value: col.columnName,
      label: col.columnName,
      hint: col.isEqlEncrypted ? 'eql_v2_encrypted' : col.dataType,
    })),
    required: true,
    initialValues: eqlColumns.map((c) => c.columnName),
  })

  if (p.isCancel(selectedColumns)) return undefined

  const searchable = await p.confirm({
    message:
      'Enable searchable encryption on these columns? (you can fine-tune indexes later)',
    initialValue: true,
  })

  if (p.isCancel(searchable)) return undefined

  const columns: ColumnDef[] = selectedColumns.map((colName) => {
    const dbCol = table.columns.find((c) => c.columnName === colName)
    if (!dbCol) {
      // Unreachable — multiselect only emits values from the source array.
      throw new Error(`Column ${colName} not found in table ${selectedTable}`)
    }
    const dataType = pgTypeToDataType(dbCol.udtName)
    const searchOps = searchable ? allSearchOps(dataType) : []
    return { name: colName, dataType, searchOps }
  })

  p.log.success(
    `Schema defined: ${selectedTable} with ${columns.length} encrypted column${columns.length !== 1 ? 's' : ''}`,
  )

  return { tableName: selectedTable, columns }
}

/**
 * Connect, introspect, and let the user pick columns in one or more tables.
 *
 * Returns `undefined` for any of:
 * - connection failure
 * - empty database (no public tables)
 * - user cancellation at any prompt
 *
 * Callers distinguish "user wanted no schemas" from "DB has nothing to pick"
 * by also checking `introspectDatabase` separately when needed.
 */
export async function buildSchemasFromDatabase(
  databaseUrl: string,
): Promise<SchemaDef[] | undefined> {
  const s = p.spinner()
  s.start('Connecting to database and reading schema...')

  let tables: DbTable[]
  try {
    tables = await introspectDatabase(databaseUrl)
  } catch (error) {
    s.stop('Failed to connect to database.')
    p.log.error(error instanceof Error ? error.message : 'Unknown error')
    return undefined
  }

  if (tables.length === 0) {
    s.stop('No tables found in the public schema.')
    return undefined
  }

  s.stop(
    `Found ${tables.length} table${tables.length !== 1 ? 's' : ''} in the public schema.`,
  )

  const schemas: SchemaDef[] = []

  while (true) {
    const schema = await selectTableColumns(tables)
    if (!schema) return undefined

    schemas.push(schema)

    const addMore = await p.confirm({
      message: 'Encrypt columns in another table?',
      initialValue: false,
    })

    if (p.isCancel(addMore)) return undefined
    if (!addMore) break
  }

  return schemas
}
