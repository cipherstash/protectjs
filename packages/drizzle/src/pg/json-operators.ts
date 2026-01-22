import type { SQLWrapper } from 'drizzle-orm'
import type { ProtectClient } from '@cipherstash/protect/client'

/**
 * Information about an encrypted column.
 * @internal
 */
export interface ColumnInfo {
  columnName: string
  config: Record<string, any>
}

/**
 * Normalizes a JSON path to dot notation format.
 * Accepts both JSONPath format ($.user.email) and dot notation (user.email).
 *
 * @param path - The path in JSONPath or dot notation format
 * @returns The normalized path in dot notation format
 */
export function normalizePath(path: string): string {
  if (path === '$') {
    return ''
  }
  if (path.startsWith('$.')) {
    return path.slice(2)
  }
  return path
}

/**
 * Builder for JSON path operations on encrypted columns.
 * Provides chainable methods for comparison and value extraction.
 */
export class JsonPathBuilder {
  private column: SQLWrapper
  private path: string
  private columnInfo: ColumnInfo
  private protectClient: ProtectClient
  /** When true, comparison methods (gt, gte, lt, lte) create array-length operators */
  private isArrayLengthMode: boolean

  constructor(
    column: SQLWrapper,
    path: string,
    columnInfo: ColumnInfo,
    protectClient: ProtectClient,
    isArrayLengthMode: boolean = false,
  ) {
    this.column = column
    this.path = path
    this.columnInfo = columnInfo
    this.protectClient = protectClient
    this.isArrayLengthMode = isArrayLengthMode
  }

  /**
   * Get the normalized path for this builder.
   * @internal
   */
  getPath(): string {
    return this.path
  }

  /**
   * Get the column for this builder.
   * @internal
   */
  getColumn(): SQLWrapper {
    return this.column
  }

  /**
   * Get the column info for this builder.
   * @internal
   */
  getColumnInfo(): ColumnInfo {
    return this.columnInfo
  }
}
