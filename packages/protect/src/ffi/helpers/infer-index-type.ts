import type { FfiIndexTypeName, QueryTypeName } from '../../types'
import { queryTypeToFfi, queryTypeToQueryOp } from '../../types'
import type { ProtectColumn } from '@cipherstash/schema'
import type { QueryOpName } from '@cipherstash/protect-ffi'

/**
 * Infer the primary index type from a column's configured indexes.
 * Priority: unique > match > ore > ste_vec (for scalar queries)
 */
export function inferIndexType(column: ProtectColumn): FfiIndexTypeName {
  const config = column.build()
  const indexes = config.indexes

  if (!indexes || Object.keys(indexes).length === 0) {
    throw new Error(`Column "${column.getName()}" has no indexes configured`)
  }

  // Priority order for inference
  if (indexes.unique) return 'unique'
  if (indexes.match) return 'match'
  if (indexes.ore) return 'ore'
  if (indexes.ste_vec) return 'ste_vec'

  throw new Error(
    `Column "${column.getName()}" has no suitable index for queries`
  )
}

/**
 * Validate that the specified index type is configured on the column
 */
export function validateIndexType(column: ProtectColumn, indexType: FfiIndexTypeName): void {
  const config = column.build()
  const indexes = config.indexes ?? {}

  const indexMap: Record<string, boolean> = {
    unique: !!indexes.unique,
    match: !!indexes.match,
    ore: !!indexes.ore,
    ste_vec: !!indexes.ste_vec,
  }

  if (!indexMap[indexType]) {
    throw new Error(
      `Index type "${indexType}" is not configured on column "${column.getName()}"`
    )
  }
}

/**
 * Resolve the index type and query operation for a query.
 * Validates the index type is configured on the column when queryType is explicit.
 *
 * @param column - The column to resolve the index type for
 * @param queryType - Optional explicit query type (if provided, validates against column config)
 * @returns The FFI index type name and optional query operation name
 */
export function resolveIndexType(
  column: ProtectColumn,
  queryType?: QueryTypeName
): { indexType: FfiIndexTypeName; queryOp?: QueryOpName } {
  const indexType = queryType
    ? queryTypeToFfi[queryType]
    : inferIndexType(column)

  if (queryType) {
    validateIndexType(column, indexType)
  }

  const queryOp = queryType ? queryTypeToQueryOp[queryType] : undefined

  return { indexType, queryOp }
}
