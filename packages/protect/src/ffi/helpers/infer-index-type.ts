import type { FfiIndexTypeName } from '../../types'
import type { ProtectColumn } from '@cipherstash/schema'

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
    `Column "${column.getName()}" has no suitable index for scalar queries`
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
  }

  if (!indexMap[indexType]) {
    throw new Error(
      `Index type "${indexType}" is not configured on column "${column.getName()}"`
    )
  }
}
