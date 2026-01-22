import type { SQLWrapper, SQL } from 'drizzle-orm'
import type { ProtectClient } from '@cipherstash/protect/client'
import type { ColumnInfo } from './operators.js'

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
 * JSON operator types for lazy evaluation.
 * Array-length operators are separate to distinguish their encryption semantics.
 */
export type JsonOperatorType =
  | 'json_eq'
  | 'json_ne'
  | 'json_contains'
  | 'json_contained_by'
  | 'json_array_length_gt'
  | 'json_array_length_gte'
  | 'json_array_length_lt'
  | 'json_array_length_lte'

/**
 * Encryption type for JSON operators:
 * - 'value': Encrypt the comparison value (eq, ne, contains, containedBy)
 * - 'selector': Encrypt the path to get selector hash (array-length on non-root)
 * - 'none': No encryption needed (array-length on root path)
 */
export type JsonEncryptionType = 'value' | 'selector' | 'none'

/**
 * Lazy JSON operator that defers encryption until awaited or batched.
 * Extends the lazy operator pattern to work with JSON path queries.
 */
export interface LazyJsonOperator {
  readonly __isLazyOperator: true
  readonly __isJsonOperator: true
  readonly operator: JsonOperatorType
  readonly path: string
  readonly columnInfo: ColumnInfo
  /** What type of encryption is needed for this operator */
  readonly encryptionType: JsonEncryptionType
  /** For value-based operators (eq, contains, etc.) - the value to encrypt */
  readonly value?: unknown
  /** For array-length operators - the plain numeric comparison value (NOT encrypted) */
  readonly comparisonValue?: number
  /** Execute with encrypted payload (encrypted value OR selector depending on encryptionType) */
  execute(encryptedPayload?: unknown): SQL
}

/**
 * Type guard for lazy JSON operators
 */
export function isLazyJsonOperator(value: unknown): value is LazyJsonOperator {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__isLazyOperator' in value &&
    '__isJsonOperator' in value &&
    (value as LazyJsonOperator).__isLazyOperator === true &&
    (value as LazyJsonOperator).__isJsonOperator === true
  )
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
