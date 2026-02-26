import {
  EncryptedColumn,
  EncryptedField,
  EncryptedTable,
  type EncryptedTableColumn,
  type TokenFilter,
  type MatchIndexOpts,
  type CastAs,
  buildEncryptConfig,
  type EncryptConfig,
} from '@/schema'

// ---------------------------------------------------------------------------
// Column config type
// ---------------------------------------------------------------------------

/**
 * Declarative column definition for use with {@link defineContract}.
 *
 * Each encrypted column must specify a `type` and can optionally enable
 * one or more searchable encryption indexes.
 */
export type ColumnConfig = {
  type: 'string' | 'number' | 'boolean' | 'date' | 'bigint' | 'json' | 'text'
  equality?: boolean | TokenFilter[]
  freeTextSearch?: boolean | MatchIndexOpts
  orderAndRange?: boolean
  searchableJson?: boolean
}

// ---------------------------------------------------------------------------
// Table and contract definition types
// ---------------------------------------------------------------------------

/**
 * Recursive type for table column definitions.
 * Leaves are {@link ColumnConfig}, intermediate nodes are nested objects.
 */
export type TableColumns = {
  [key: string]: ColumnConfig | TableColumns
}

/**
 * Top-level contract definition: maps table names to their column definitions.
 */
export type ContractDefinition = {
  [tableName: string]: TableColumns
}

// ---------------------------------------------------------------------------
// Helper function for type inference
// ---------------------------------------------------------------------------

/**
 * Define an encrypted column with full type inference.
 *
 * This is an identity function at runtime — it returns the config object as-is.
 * At the type level, it preserves the literal types of the config so that
 * TypeScript can infer the column's data type through the contract.
 *
 * @example
 * ```typescript
 * import { defineContract, encrypted } from '@cipherstash/stack/contract'
 *
 * const contract = defineContract({
 *   users: {
 *     email: encrypted({ type: 'string', equality: true }),
 *     name: encrypted({ type: 'string', freeTextSearch: true }),
 *     age: encrypted({ type: 'number', orderAndRange: true }),
 *   }
 * })
 * ```
 */
export function encrypted<T extends ColumnConfig>(config: T): T {
  return config
}

// ---------------------------------------------------------------------------
// Discriminator
// ---------------------------------------------------------------------------

const VALID_COLUMN_TYPES = new Set([
  'string',
  'number',
  'boolean',
  'date',
  'bigint',
  'json',
  'text',
])

/**
 * Type guard that identifies a leaf {@link ColumnConfig} node by the presence
 * of a `type` key with a valid column type value.
 */
export function isColumnConfig(value: unknown): value is ColumnConfig {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof (value as Record<string, unknown>).type === 'string' &&
    VALID_COLUMN_TYPES.has((value as Record<string, unknown>).type as string)
  )
}

// ---------------------------------------------------------------------------
// Runtime references
// ---------------------------------------------------------------------------

/**
 * Wraps both a column/field and its parent table so that a single value
 * can be passed to `encrypt`, `encryptQuery`, and `bulkEncrypt`.
 */
export class ContractColumnRef {
  readonly _column: EncryptedColumn | EncryptedField
  readonly _table: EncryptedTable<EncryptedTableColumn>

  constructor(
    column: EncryptedColumn | EncryptedField,
    table: EncryptedTable<EncryptedTableColumn>,
  ) {
    this._column = column
    this._table = table
  }
}

/**
 * Wraps an {@link EncryptedTable} and carries column type information at the
 * type level for `encryptModel` / `bulkEncryptModels` return type inference.
 */
export class ContractTableRef<C extends TableColumns = TableColumns> {
  readonly _table: EncryptedTable<EncryptedTableColumn>
  /** Type-level brand so TypeScript can infer `C`. */
  declare readonly _contractColumns: C

  constructor(table: EncryptedTable<EncryptedTableColumn>) {
    this._table = table
  }
}

// ---------------------------------------------------------------------------
// Type-level mapping
// ---------------------------------------------------------------------------

/** Maps nested column definitions to {@link ContractColumnRef} at the type level. */
type ResolvedColumns<C> = {
  [K in keyof C]: C[K] extends ColumnConfig
    ? ContractColumnRef
    : C[K] extends TableColumns
      ? ResolvedColumns<C[K]>
      : never
}

/**
 * The fully resolved contract type returned by {@link defineContract}.
 *
 * - `contract.tableName` resolves to a {@link ContractTableRef}
 * - `contract.tableName.column` resolves to a {@link ContractColumnRef}
 * - `contract.__tables` provides the internal `EncryptedTable[]` for client init
 */
export type ResolvedContract<T extends ContractDefinition> = {
  [Table in keyof T]: ContractTableRef<T[Table]> & ResolvedColumns<T[Table]>
} & { __tables: EncryptedTable<EncryptedTableColumn>[] }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Minimal structural type that all resolved contracts satisfy.
 * Used in function signatures that need to accept any contract.
 */
export type AnyResolvedContract = {
  __tables: EncryptedTable<EncryptedTableColumn>[]
}

/** Extract the internal `EncryptedTable[]` from a resolved contract. */
export function getContractTables(
  contract: AnyResolvedContract,
): EncryptedTable<EncryptedTableColumn>[] {
  return contract.__tables
}

/** Build an {@link EncryptConfig} directly from a resolved contract. */
export function buildContractEncryptConfig(
  contract: AnyResolvedContract,
): EncryptConfig {
  return buildEncryptConfig(...contract.__tables)
}

// ---------------------------------------------------------------------------
// Internal builders
// ---------------------------------------------------------------------------

function buildColumn(name: string, config: ColumnConfig): EncryptedColumn {
  const col = new EncryptedColumn(name)

  if (config.type !== 'string') {
    col.dataType(config.type as CastAs)
  }

  if (config.equality) {
    if (Array.isArray(config.equality)) {
      col.equality(config.equality)
    } else {
      col.equality()
    }
  }

  if (config.freeTextSearch) {
    if (typeof config.freeTextSearch === 'object') {
      col.freeTextSearch(config.freeTextSearch)
    } else {
      col.freeTextSearch()
    }
  }

  if (config.orderAndRange) {
    col.orderAndRange()
  }

  if (config.searchableJson) {
    col.searchableJson()
  }

  return col
}

function buildField(name: string, config: ColumnConfig): EncryptedField {
  const field = new EncryptedField(name)

  if (config.type !== 'string') {
    field.dataType(config.type as CastAs)
  }

  return field
}

/**
 * Recursively processes column definitions.
 * Top-level configs produce `EncryptedColumn`, nested produce `EncryptedField`
 * with dot-path names (e.g. `'example.field'`).
 */
function processColumns(
  columns: TableColumns,
  prefix = '',
): Record<string, EncryptedColumn | EncryptedField> {
  const result: Record<string, EncryptedColumn | EncryptedField> = {}

  for (const [key, value] of Object.entries(columns)) {
    if (isColumnConfig(value)) {
      const fullPath = prefix ? `${prefix}.${key}` : key
      if (prefix) {
        result[fullPath] = buildField(fullPath, value)
      } else {
        result[key] = buildColumn(key, value)
      }
    } else {
      const nestedPrefix = prefix ? `${prefix}.${key}` : key
      Object.assign(
        result,
        processColumns(value as TableColumns, nestedPrefix),
      )
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Proxy helpers
// ---------------------------------------------------------------------------

function createNestedProxy(
  columnRefs: Record<string, ContractColumnRef>,
  columns: TableColumns,
  prefix: string,
): Record<string, unknown> {
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop, receiver) {
      if (typeof prop !== 'string') {
        return Reflect.get(_target, prop, receiver)
      }

      const fullPath = `${prefix}.${prop}`

      if (fullPath in columnRefs) {
        return columnRefs[fullPath]
      }

      if (prop in columns) {
        const value = columns[prop]
        if (isColumnConfig(value)) {
          return columnRefs[fullPath]
        }
        return createNestedProxy(
          columnRefs,
          value as TableColumns,
          fullPath,
        )
      }

      return undefined
    },
  }

  return new Proxy({} as Record<string, unknown>, handler)
}

function createTableProxy<C extends TableColumns>(
  tableRef: ContractTableRef<C>,
  columnRefs: Record<string, ContractColumnRef>,
  tableColumns: TableColumns,
): ContractTableRef<C> & ResolvedColumns<C> {
  const handler: ProxyHandler<ContractTableRef<C>> = {
    get(target, prop, receiver) {
      // ContractTableRef own properties
      if (prop === '_table' || prop === '_contractColumns') {
        return Reflect.get(target, prop, receiver)
      }

      if (typeof prop !== 'string') {
        return Reflect.get(target, prop, receiver)
      }

      // Direct column ref (top-level)
      if (prop in columnRefs) {
        return columnRefs[prop]
      }

      // Nested object — create sub-proxy
      if (prop in tableColumns) {
        const value = tableColumns[prop]
        if (isColumnConfig(value)) {
          return columnRefs[prop]
        }
        return createNestedProxy(
          columnRefs,
          value as TableColumns,
          prop,
        )
      }

      return Reflect.get(target, prop, receiver)
    },
  }

  return new Proxy(tableRef, handler) as ContractTableRef<C> &
    ResolvedColumns<C>
}

// ---------------------------------------------------------------------------
// defineContract
// ---------------------------------------------------------------------------

/**
 * Define a declarative encryption contract.
 *
 * Takes a plain object mapping table names to column definitions and
 * returns a proxy that provides typed access to column and table references
 * for use with the encryption client.
 *
 * @example
 * ```typescript
 * import { defineContract, encrypted } from '@cipherstash/stack/contract'
 *
 * const contract = defineContract({
 *   users: {
 *     email: encrypted({ type: 'string', equality: true, freeTextSearch: true }),
 *     age: encrypted({ type: 'number', orderAndRange: true }),
 *   },
 * })
 *
 * const client = await Encryption({ contract })
 * await client.encrypt('hello', { contract: contract.users.email })
 * ```
 */
export function defineContract<T extends ContractDefinition>(
  definition: T,
): ResolvedContract<T> {
  const tables: EncryptedTable<EncryptedTableColumn>[] = []
  const tableProxies: Record<string, unknown> = {}

  for (const [tableName, tableColumns] of Object.entries(definition)) {
    // Build internal EncryptedColumn / EncryptedField instances
    const processedColumns = processColumns(tableColumns)

    // Build EncryptedTableColumn structure for EncryptedTable
    const tableColumnDef: EncryptedTableColumn = {}

    for (const [path, col] of Object.entries(processedColumns)) {
      if (!path.includes('.')) {
        // Top-level column
        tableColumnDef[path] = col as EncryptedColumn
      } else {
        // Nested field — reconstruct nested structure
        const parts = path.split('.')
        // biome-ignore lint/suspicious/noExplicitAny: building nested structure dynamically
        let current: any = tableColumnDef
        for (let i = 0; i < parts.length - 1; i++) {
          if (!current[parts[i]]) {
            current[parts[i]] = {}
          }
          current = current[parts[i]]
        }
        current[parts[parts.length - 1]] = col as EncryptedField
      }
    }

    // Create the EncryptedTable and copy column builders as direct properties
    // (matches encryptedTable() behavior so that code can access table[colName])
    const encTable = new EncryptedTable(tableName, tableColumnDef)
    for (const [colName, colBuilder] of Object.entries(tableColumnDef)) {
      ;(encTable as unknown as EncryptedTableColumn)[colName] = colBuilder
    }
    tables.push(encTable)

    // Create ContractColumnRef for each processed column
    const columnRefs: Record<string, ContractColumnRef> = {}
    for (const [path, col] of Object.entries(processedColumns)) {
      columnRefs[path] = new ContractColumnRef(col, encTable)
    }

    // Create the ContractTableRef
    const tableRef = new ContractTableRef(encTable)

    // Create the table-level proxy
    tableProxies[tableName] = createTableProxy(
      tableRef,
      columnRefs,
      tableColumns,
    )
  }

  // Create the top-level contract proxy
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop, receiver) {
      if (prop === '__tables') {
        return tables
      }

      if (typeof prop === 'string' && prop in tableProxies) {
        return tableProxies[prop]
      }

      return Reflect.get(_target, prop, receiver)
    },
  }

  return new Proxy(
    {} as Record<string, unknown>,
    handler,
  ) as ResolvedContract<T>
}
