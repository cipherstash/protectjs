import {
  type EncryptedColumn,
  type EncryptedTable,
  encryptedColumn,
  encryptedTable,
} from '@/schema'
import { ENCRYPTED_STORAGE_CODEC_ID, type EncryptedDataType } from './constants'

/**
 * Derive `EncryptedTable[]` schemas from a Prisma Next contract.
 *
 * Phase 2 routed every encrypted-column encrypt through one of five
 * dataType-keyed placeholder columns (`value_string`, `value_number`, …).
 * Phase 3 walks the contract's storage layout, finds every column whose
 * `codecId === 'cs/eql_v2_encrypted@1'`, and builds an
 * `EncryptedTable` with the right per-column index configuration.
 *
 * Why we still keep the placeholder schema:
 *   - The test suite (and a handful of cross-cutting utilities, e.g.
 *     codec round-trips inside the FFI test fixtures) call codec
 *     encode/decode without a contract loaded. Falling back to the
 *     placeholder for these cases keeps Phase 1+2's 53 tests passing.
 *   - Future work (a parameterized-codec `init` that gives the codec
 *     the column-side dataType at encode time) can retire the
 *     placeholder once the contract has been threaded through to every
 *     call site.
 */

/**
 * Minimal shape of a Prisma Next contract's SQL storage layout. The
 * contract has many more fields; we only consume what we need for
 * schema derivation (and we deliberately avoid pinning to a specific
 * post-#379 internal type so this works against the live trunk).
 */
export interface ContractLike {
  readonly storage?: {
    readonly tables?: Readonly<Record<string, ContractTable>>
    readonly types?: Readonly<Record<string, ContractTypeInstance>>
  }
  readonly models?: Readonly<Record<string, ContractModelLike>>
}

interface ContractTable {
  readonly columns?: Readonly<Record<string, ContractColumn>>
}

interface ContractColumn {
  readonly codecId?: string
  readonly nativeType?: string
  readonly typeParams?: Record<string, unknown>
  readonly typeRef?: string
}

interface ContractTypeInstance {
  readonly codecId?: string
  readonly nativeType?: string
  readonly typeParams?: Record<string, unknown>
}

interface ContractModelLike {
  readonly storage?: {
    readonly table?: string
    readonly fields?: Readonly<Record<string, { readonly column?: string }>>
  }
}

/**
 * Read a column's resolved typeParams. Columns may either inline
 * `typeParams` or reference a named type instance via `typeRef`. The
 * post-#379 contract emits inline `typeParams` for non-shared columns;
 * `typeRef` is for shared types declared in `storage.types`.
 */
function resolveTypeParams(
  column: ContractColumn,
  types: Readonly<Record<string, ContractTypeInstance>> | undefined,
): Record<string, unknown> | undefined {
  if (column.typeParams) return column.typeParams
  if (column.typeRef && types) {
    const ref = types[column.typeRef]
    if (ref?.typeParams) return ref.typeParams
  }
  return undefined
}

function resolveCodecId(
  column: ContractColumn,
  types: Readonly<Record<string, ContractTypeInstance>> | undefined,
): string | undefined {
  if (column.codecId) return column.codecId
  if (column.typeRef && types) {
    return types[column.typeRef]?.codecId
  }
  return undefined
}

function isEncryptedDataType(value: unknown): value is EncryptedDataType {
  return (
    value === 'string' ||
    value === 'number' ||
    value === 'boolean' ||
    value === 'date' ||
    value === 'json'
  )
}

/**
 * Apply a column's typeParams flags to an `EncryptedColumn` builder.
 *
 * Each searchable-encryption flag maps to a method on the builder.
 * `dataType` is set first because some downstream methods (notably
 * `searchableJson` requiring `dataType === 'json'`) validate against
 * it.
 */
function buildEncryptedColumn(
  columnName: string,
  typeParams: Record<string, unknown>,
): EncryptedColumn | null {
  const dataType = typeParams.dataType
  if (!isEncryptedDataType(dataType)) return null

  const builder: EncryptedColumn =
    encryptedColumn(columnName).dataType(dataType)

  if (typeParams.equality === true) {
    builder.equality()
  }
  if (typeParams.freeTextSearch === true && dataType === 'string') {
    builder.freeTextSearch()
  }
  if (typeParams.orderAndRange === true) {
    builder.orderAndRange()
  }
  if (typeParams.searchableJson === true && dataType === 'json') {
    builder.searchableJson()
  }

  return builder
}

/**
 * Walk a contract and produce one `EncryptedTable` per table that has
 * at least one encrypted column.
 *
 * The contract may not be fully populated in every code path
 * (test fixtures, cross-cutting utilities), so the function is
 * tolerant of missing fields: an undefined contract yields an empty
 * array, and tables with no encrypted columns are skipped.
 */
export function extractEncryptedSchemas(
  contract: ContractLike | undefined | null,
): ReadonlyArray<EncryptedTable<Record<string, EncryptedColumn>>> {
  if (!contract) return []
  const storage = contract.storage
  if (!storage?.tables) return []

  const types = storage.types
  const out: EncryptedTable<Record<string, EncryptedColumn>>[] = []

  for (const [tableName, table] of Object.entries(storage.tables)) {
    if (!table.columns) continue

    const encryptedColumns: Record<string, EncryptedColumn> = {}
    for (const [columnName, column] of Object.entries(table.columns)) {
      const codecId = resolveCodecId(column, types)
      if (codecId !== ENCRYPTED_STORAGE_CODEC_ID) continue
      const typeParams = resolveTypeParams(column, types)
      if (!typeParams) continue

      const built = buildEncryptedColumn(columnName, typeParams)
      if (built) encryptedColumns[columnName] = built
    }

    if (Object.keys(encryptedColumns).length === 0) continue
    out.push(encryptedTable(tableName, encryptedColumns))
  }

  return out
}
