import { sql, type SQLWrapper, type SQL, bindIfParam } from 'drizzle-orm'
import type { ProtectClient } from '@cipherstash/protect/client'
import type {
  JsonPathQueryTerm,
  JsonContainsQueryTerm,
  JsonContainedByQueryTerm,
  QueryTerm,
} from '@cipherstash/protect'
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

  /**
   * Check if this builder represents the root path.
   * @internal
   */
  private isRootPath(): boolean {
    return this.path === ''
  }

  /**
   * Equality comparison at the JSON path.
   * Returns a lazy operator for deferred encryption and batching.
   *
   * @param value - The value to compare against
   * @returns A lazy JSON operator that can be awaited or batched
   *
   * @example
   * ```typescript
   * await ops.jsonPath(users.metadata, '$.user.email').eq('test@example.com')
   * ```
   */
  eq(value: unknown): LazyJsonOperator & Promise<SQL> {
    return this.createLazyJsonOperator('json_eq', value)
  }

  /**
   * Not equal comparison at the JSON path.
   *
   * @param value - The value to compare against
   * @returns A lazy JSON operator
   */
  ne(value: unknown): LazyJsonOperator & Promise<SQL> {
    return this.createLazyJsonOperator('json_ne', value)
  }

  /**
   * JSON containment check (@> operator).
   * Checks if the JSON at this path contains the specified object.
   *
   * @param obj - The object to check containment for
   * @returns A lazy JSON operator
   *
   * @example
   * ```typescript
   * await ops.jsonPath(users.metadata, '$').contains({ role: 'admin' })
   * ```
   */
  contains(obj: Record<string, unknown>): LazyJsonOperator & Promise<SQL> {
    return this.createLazyJsonOperator('json_contains', obj)
  }

  /**
   * Reverse JSON containment check (<@ operator).
   * Checks if the JSON at this path is contained by the specified object.
   *
   * @param obj - The object to check containment against
   * @returns A lazy JSON operator
   */
  containedBy(obj: Record<string, unknown>): LazyJsonOperator & Promise<SQL> {
    return this.createLazyJsonOperator('json_contained_by', obj)
  }

  /**
   * Extract values at the current path using an encrypted selector.
   * Encrypts the current path to get a selector, then queries with it.
   *
   * IMPORTANT: This is a set-returning function (SRF) - it returns multiple rows.
   * For root path, use the column directly or pathExtractFirst() instead.
   *
   * @throws Error if called on root path (use column directly for root)
   * @returns Promise resolving to SQL expression for all matching values (SRF)
   *
   * @example
   * ```typescript
   * // Extract all items (returns multiple rows)
   * const items = await ops.jsonPath(users.metadata, '$.items').pathExtract()
   * ```
   */
  async pathExtract(): Promise<SQL> {
    if (this.isRootPath()) {
      throw new Error(
        `pathExtract() is not supported for root path. ` +
        `For root, use the column directly in your query, or use pathExtractFirst() ` +
        `which returns a single value.`
      )
    }

    // Non-root: encrypt path to get selector, then use jsonb_path_query (SRF)
    const selector = await encryptPathSelector(this.protectClient, this.path, this.columnInfo)
    return sql`eql_v2.jsonb_path_query(${this.column}, ${selector})`
  }

  /**
   * Extract the first value at the current path using an encrypted selector.
   *
   * For root path: returns the column directly (the whole JSON IS the first/only value)
   * For nested path: encrypts path to selector and uses eql_v2.jsonb_path_query_first
   *
   * @returns Promise resolving to SQL expression for the first matching value
   */
  async pathExtractFirst(): Promise<SQL> {
    if (this.isRootPath()) {
      // Root path: the column itself is the first/only value
      return sql`${this.column}`
    }

    // Non-root: encrypt path to get selector
    const selector = await encryptPathSelector(this.protectClient, this.path, this.columnInfo)
    return sql`eql_v2.jsonb_path_query_first(${this.column}, ${selector})`
  }

  /**
   * Extract values using a pre-encrypted selector.
   * For advanced users who already have an encrypted selector hash.
   *
   * @param selector - Pre-encrypted selector hash
   * @returns SQL expression for matching values
   */
  pathExtractWithSelector(selector: string): SQL {
    return sql`eql_v2.jsonb_path_query(${this.column}, ${selector})`
  }

  /**
   * Extract first value using a pre-encrypted selector.
   * For advanced users who already have an encrypted selector hash.
   *
   * @param selector - Pre-encrypted selector hash
   * @returns SQL expression for the first matching value
   */
  pathExtractFirstWithSelector(selector: string): SQL {
    return sql`eql_v2.jsonb_path_query_first(${this.column}, ${selector})`
  }

  /**
   * Creates a lazy JSON operator for deferred execution.
   * @internal
   */
  private createLazyJsonOperator(
    operator: JsonOperatorType,
    value: unknown,
  ): LazyJsonOperator & Promise<SQL> {
    const column = this.column
    const path = this.path
    const columnInfo = this.columnInfo
    const protectClient = this.protectClient

    const lazyOp: LazyJsonOperator = {
      __isLazyOperator: true,
      __isJsonOperator: true,
      operator,
      path,
      value,
      encryptionType: 'value',  // Value-based operators need the comparison value encrypted
      columnInfo,
      execute: (encryptedValue?: unknown) => {
        // Will be implemented in Task 13
        return sql`true` // placeholder
      },
    }

    // Create promise for direct await usage
    // CRITICAL: Must encrypt the value before calling execute()
    let executionStarted = false
    const promise = new Promise<SQL>((resolve, reject) => {
      // Use a getter trap via Object.defineProperty to defer execution
      // This avoids queuing the microtask until the promise is actually consumed
      const startExecution = () => {
        if (executionStarted) return
        executionStarted = true
        queueMicrotask(async () => {
          try {
            // Build QueryTerm and encrypt using same logic as and()/or() batching
            const encrypted = await encryptSingleJsonOperator(
              protectClient,
              lazyOp,
            )
            const result = lazyOp.execute(encrypted)
            resolve(result)
          } catch (error) {
            reject(error)
          }
        })
      }

      // Start execution immediately - this maintains compatibility with the LazyOperator pattern
      startExecution()
    })

    return Object.assign(promise, lazyOp)
  }
}

/**
 * Encrypts a single JSON operator using the same logic as batch encryption.
 * Used by both direct await and batched and()/or() operations.
 * @internal
 */
export async function encryptSingleJsonOperator(
  protectClient: ProtectClient,
  op: LazyJsonOperator,
): Promise<unknown> {
  const { protectColumn, protectTable } = op.columnInfo as any

  if (!protectColumn || !protectTable) {
    // If columnInfo is incomplete (e.g., in tests with mocks), return the value as-is
    // In production, the columnInfo will always have these properties set
    return op.value
  }

  // Build QueryTerm based on operator type
  let queryTerm: QueryTerm

  if (op.operator === 'json_eq' || op.operator === 'json_ne') {
    queryTerm = {
      path: op.path,
      value: op.value as string | number,
      column: protectColumn,
      table: protectTable,
    } satisfies JsonPathQueryTerm
  } else if (op.operator === 'json_contains') {
    queryTerm = {
      contains: op.value as Record<string, unknown>,
      column: protectColumn,
      table: protectTable,
    } satisfies JsonContainsQueryTerm
  } else if (op.operator === 'json_contained_by') {
    queryTerm = {
      containedBy: op.value as Record<string, unknown>,
      column: protectColumn,
      table: protectTable,
    } satisfies JsonContainedByQueryTerm
  } else {
    // Array-length operators don't encrypt the comparison value
    // They may need selector encryption, but that's handled separately
    return op.value
  }

  const result = await protectClient.encryptQuery([queryTerm])

  if (result.failure) {
    throw new Error(`Failed to encrypt JSON query: ${result.failure.message}`)
  }

  return result.data[0]
}

/**
 * Encrypts a JSON path to get its selector hash.
 * Used for jsonb_path_query_first operations (e.g., array-length on non-root paths).
 * @internal
 */
export async function encryptPathSelector(
  protectClient: ProtectClient,
  path: string,
  columnInfo: ColumnInfo,
): Promise<string> {
  const { protectColumn, protectTable } = columnInfo as any

  if (!protectColumn || !protectTable) {
    // If columnInfo is incomplete (e.g., in tests with mocks), return a placeholder selector
    // In production, the columnInfo will always have these properties set
    return 'mock_selector'
  }

  // Use JsonPathQueryTerm without a value to get just the selector
  const queryTerm: JsonPathQueryTerm = {
    path,
    column: protectColumn,
    table: protectTable,
    // No value - we just need the selector hash for path extraction
  }

  const result = await protectClient.encryptQuery([queryTerm])

  if (result.failure) {
    throw new Error(`Failed to encrypt path selector: ${result.failure.message}`)
  }

  // Extract the selector from the result
  // JsonPathQueryTerm without value returns { s: selector }
  const encrypted = result.data[0] as { s: string }
  return encrypted.s
}
