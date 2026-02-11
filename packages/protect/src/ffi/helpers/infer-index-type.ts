import type { ProtectColumn } from '@cipherstash/schema'
import type { FfiIndexTypeName, QueryTypeName } from '../../types'
import { queryTypeToFfi } from '../../types'

/**
 * Infer the primary index type from a column's configured indexes.
 * Priority: unique > match > ore (for scalar queries)
 */
export function inferIndexType(column: ProtectColumn): FfiIndexTypeName {
  const config = column.build()
  const indexes = config.indexes

  if (!indexes || Object.keys(indexes).length === 0) {
    throw new Error(`Column "${column.getName()}" has no indexes configured`)
  }

  if (indexes.unique) return 'unique'
  if (indexes.match) return 'match'
  if (indexes.ore) return 'ore'

  throw new Error(
    `Column "${column.getName()}" has no suitable index for scalar queries`,
  )
}

/**
 * Validate that the specified index type is configured on the column
 */
export function validateIndexType(
  column: ProtectColumn,
  indexType: FfiIndexTypeName,
): void {
  const config = column.build()
  const indexes = config.indexes ?? {}

  const indexMap: Record<string, boolean> = {
    unique: !!indexes.unique,
    match: !!indexes.match,
    ore: !!indexes.ore,
  }

  if (!indexMap[indexType]) {
    throw new Error(
      `Index type "${indexType}" is not configured on column "${column.getName()}"`,
    )
  }
}

/**
 * Resolve the index type for a query, either from explicit queryType or by inference.
 * Validates the index type is configured on the column when queryType is explicit.
 *
 * @param column - The column to resolve the index type for
 * @param queryType - Optional explicit query type (if provided, validates against column config)
 * @returns The FFI index type name to use for the query
 */
export function resolveIndexType(
  column: ProtectColumn,
  queryType?: QueryTypeName,
): FfiIndexTypeName {
  const indexType = queryType
    ? queryTypeToFfi[queryType]
    : inferIndexType(column)

  if (queryType) {
    validateIndexType(column, indexType)
  }

  return indexType
}
