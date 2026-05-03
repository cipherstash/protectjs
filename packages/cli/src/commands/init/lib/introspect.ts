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
  // pg.Client defaults `connectionTimeoutMillis` to "no timeout"; without
  // this, an unreachable / firewalled database silently hangs the spinner
  // until the user kills the process. 10 s is generous for healthy hosts
  // and short enough to surface a real failure quickly.
  const client = new pg.Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 10_000,
  })
  try {
    await client.connect()

    // Tables in the `eql_v2_` namespace are EQL's own configuration / state
    // (e.g. `eql_v2_configuration`). Encrypting their columns would break EQL
    // itself, so filter them out at the source — they never get offered as
    // a choice in the picker.
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
        AND c.table_name NOT LIKE 'eql_v2_%'
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

export function allSearchOps(dataType: DataType): SearchOp[] {
  const ops: SearchOp[] = ['equality', 'orderAndRange']
  if (dataType === 'string') {
    ops.push('freeTextSearch')
  }
  return ops
}

/**
 * Result of running the per-table picker.
 *
 *   schema  — user chose ≥1 column (or kept all-already-encrypted as-is)
 *   skip    — user chose to skip this table; only offered when the user has
 *             already configured at least one other table this run
 *   cancel  — user hit Ctrl+C / Esc somewhere; caller should bail entirely
 */
export type SelectColumnsResult =
  | { kind: 'schema'; schema: SchemaDef }
  | { kind: 'skip' }
  | { kind: 'cancel' }

/**
 * Build the final ColumnDef[] for a table by merging:
 *  - columns already typed `eql_v2_encrypted` in the DB (always included —
 *    they're already encrypted, dropping them would silently lose data)
 *  - the columns the user picked in the multiselect
 *
 * Output order matches the source table's column order so the generated
 * client file reads top-to-bottom against the schema. Pure for testing.
 */
export function buildColumnDefs(
  table: DbTable,
  pickedColumnNames: string[],
  searchable: boolean,
): ColumnDef[] {
  const picked = new Set(pickedColumnNames)
  return table.columns
    .filter((c) => c.isEqlEncrypted || picked.has(c.columnName))
    .map((dbCol) => {
      const dataType = pgTypeToDataType(dbCol.udtName)
      return {
        name: dbCol.columnName,
        dataType,
        searchOps: searchable ? allSearchOps(dataType) : [],
      }
    })
}

/**
 * Format a list of column names like "a, b, c" or "a, b, and c" — small
 * helper so summaries read naturally in CLI prompts.
 */
export function joinNames(names: string[]): string {
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
}

/** "1 column" / "3 columns" — used in several user-facing summaries. */
function plural(count: number): string {
  return count === 1 ? '' : 's'
}

/**
 * Prompt for searchable-encryption + emit the success log + build the
 * final ColumnDef[]. Shared between the all-already-encrypted branch and
 * the user-pick branch — both end the same way.
 */
async function finalizePicks(
  table: DbTable,
  picked: string[],
): Promise<SelectColumnsResult> {
  const searchable = await p.confirm({
    message:
      'Enable searchable encryption on these columns? (you can fine-tune indexes later)',
    initialValue: true,
  })
  if (p.isCancel(searchable)) return { kind: 'cancel' }
  const columns = buildColumnDefs(table, picked, searchable)
  p.log.success(
    `Schema defined: ${table.tableName} with ${columns.length} encrypted column${plural(columns.length)}`,
  )
  return { kind: 'schema', schema: { tableName: table.tableName, columns } }
}

/**
 * Interactive multi-select: which columns in which table should be encrypted?
 *
 * `priorCount` is how many tables the user has already configured this run.
 * It's used to decide whether to offer "skip this table" as a recovery
 * option when the user submits the multiselect with no columns checked —
 * skipping is only sensible when they've already picked something elsewhere.
 *
 * Pre-encrypted columns (Postgres type `eql_v2_encrypted`) are *not*
 * displayed in the multiselect; they're shown above it as a "will be kept"
 * note and merged back into the schema. Clack doesn't support disabled rows,
 * so this is the closest we get to "displayed but not toggleable".
 */
export async function selectTableColumns(
  tables: DbTable[],
  priorCount = 0,
): Promise<SelectColumnsResult> {
  const selectedTable = await p.select({
    message: 'Which table do you want to encrypt columns in?',
    options: tables.map((t) => {
      const eqlCount = t.columns.filter((c) => c.isEqlEncrypted).length
      const hint =
        eqlCount > 0
          ? `${t.columns.length} columns, ${eqlCount} already encrypted`
          : `${t.columns.length} column${plural(t.columns.length)}`
      return { value: t.tableName, label: t.tableName, hint }
    }),
  })

  if (p.isCancel(selectedTable)) return { kind: 'cancel' }

  const table = tables.find((t) => t.tableName === selectedTable)
  if (!table) return { kind: 'cancel' }

  const eqlColumns = table.columns.filter((c) => c.isEqlEncrypted)
  const pickable = table.columns.filter((c) => !c.isEqlEncrypted)

  if (eqlColumns.length > 0) {
    p.log.info(
      `Already encrypted (will be kept as-is): ${joinNames(
        eqlColumns.map((c) => c.columnName),
      )}`,
    )
  }

  // Edge case: every column in the table is already encrypted. Nothing to
  // pick — just confirm the user wants to record this table verbatim.
  if (pickable.length === 0) {
    const keep = await p.confirm({
      message: `All columns in "${selectedTable}" are already encrypted. Keep as-is?`,
      initialValue: true,
    })
    if (p.isCancel(keep)) return { kind: 'cancel' }
    if (!keep) return { kind: 'skip' }
    return finalizePicks(table, [])
  }

  // Loop until the user either picks ≥1 column and confirms, or chooses to
  // skip the table (only allowed when they've already configured another).
  while (true) {
    const picked = await p.multiselect({
      message: `Which columns in "${selectedTable}" should be encrypted? (space to toggle, enter to confirm)`,
      options: pickable.map((col) => ({
        value: col.columnName,
        label: col.columnName,
        hint: col.dataType,
      })),
      required: false,
    })

    if (p.isCancel(picked)) return { kind: 'cancel' }

    if (picked.length === 0) {
      if (priorCount === 0) {
        p.log.warn(
          'You need to encrypt at least one column. Use space to toggle a column, enter to confirm.',
        )
        continue
      }
      const skip = await p.confirm({
        message: `Skip encryption for the "${selectedTable}" table?`,
        initialValue: true,
      })
      if (p.isCancel(skip)) return { kind: 'cancel' }
      if (skip) return { kind: 'skip' }
      continue
    }

    const proceed = await p.confirm({
      message: `Encrypt ${picked.length} column${plural(picked.length)} in "${selectedTable}" (${joinNames(picked as string[])})?`,
      initialValue: true,
    })
    if (p.isCancel(proceed)) return { kind: 'cancel' }
    if (!proceed) continue

    return finalizePicks(table, picked as string[])
  }
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
    `Found ${tables.length} table${plural(tables.length)} in the public schema.`,
  )

  const schemas: SchemaDef[] = []
  // Track names already configured this run so we never offer the same
  // table twice — picking it again would push a duplicate `SchemaDef` and
  // emit duplicate encrypted-column declarations downstream.
  const alreadySelected = new Set<string>()

  while (true) {
    const remaining = tables.filter((t) => !alreadySelected.has(t.tableName))
    if (remaining.length === 0) break

    const result = await selectTableColumns(remaining, schemas.length)
    if (result.kind === 'cancel') return undefined
    if (result.kind === 'schema') {
      alreadySelected.add(result.schema.tableName)
      schemas.push(result.schema)
    }
    // 'skip' just falls through to the "another table?" prompt without
    // adding anything — the user already had another configured.

    // No tables left after this one — skip the redundant "another?" prompt.
    if (alreadySelected.size === tables.length) break

    const addMore = await p.confirm({
      message: 'Encrypt columns in another table?',
      initialValue: false,
    })

    if (p.isCancel(addMore)) return undefined
    if (!addMore) break
  }

  if (schemas.length === 0) return undefined

  return schemas
}
