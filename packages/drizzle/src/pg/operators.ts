import type {
  ProtectClient,
  ProtectColumn,
  ProtectTable,
  ProtectTableColumn,
} from '@cipherstash/protect'
import {
  type SQL,
  type SQLWrapper,
  and,
  arrayContained,
  arrayContains,
  arrayOverlaps,
  asc,
  between,
  desc,
  eq,
  exists,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  ne,
  not,
  notBetween,
  notExists,
  notIlike,
  notInArray,
  or,
} from 'drizzle-orm'
import { bindIfParam, sql } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import type { EncryptedColumnConfig } from './index.js'
import { getEncryptedColumnConfig } from './index.js'
import { extractProtectSchema } from './schema-extraction.js'

/**
 * Helper to extract table name from a Drizzle table
 */
function getDrizzleTableName(drizzleTable: unknown): string | undefined {
  // biome-ignore lint/suspicious/noExplicitAny: Drizzle tables don't expose Symbol properties in types
  return (drizzleTable as any)?.[Symbol.for('drizzle:Name')] as
    | string
    | undefined
}

/**
 * Helper to get the drizzle table from a drizzle column
 */
function getDrizzleTableFromColumn(drizzleColumn: SQLWrapper): unknown {
  const columnAny = drizzleColumn as unknown as Record<string, unknown>
  return columnAny.table as unknown
}

/**
 * Helper to extract protect table from a drizzle column by deriving it from the column's parent table
 */
function getProtectTableFromColumn(
  drizzleColumn: SQLWrapper,
  protectTableCache: Map<string, ProtectTable<ProtectTableColumn>>,
): ProtectTable<ProtectTableColumn> | undefined {
  const drizzleTable = getDrizzleTableFromColumn(drizzleColumn)
  if (!drizzleTable) {
    return undefined
  }

  const tableName = getDrizzleTableName(drizzleTable)
  if (!tableName) {
    return undefined
  }

  // Check cache first
  let protectTable = protectTableCache.get(tableName)
  if (protectTable) {
    return protectTable
  }

  // Extract protect schema from drizzle table and cache it
  try {
    // biome-ignore lint/suspicious/noExplicitAny: PgTable type doesn't expose all needed properties
    protectTable = extractProtectSchema(drizzleTable as PgTable<any>)
    protectTableCache.set(tableName, protectTable)
    return protectTable
  } catch {
    // Table doesn't have encrypted columns or extraction failed
    return undefined
  }
}

/**
 * Helper to get the ProtectColumn for a Drizzle column from the ProtectTable
 */
function getProtectColumn(
  drizzleColumn: SQLWrapper,
  protectTable: ProtectTable<ProtectTableColumn>,
): ProtectColumn | undefined {
  // Get column name from Drizzle column
  const drizzleColumnAny = drizzleColumn as unknown as Record<string, unknown>
  const columnName = drizzleColumnAny.name as string | undefined
  if (!columnName) {
    return undefined
  }

  // Get ProtectColumn from ProtectTable
  const protectTableAny = protectTable as unknown as Record<string, unknown>
  const protectColumn = protectTableAny[columnName] as ProtectColumn | undefined

  return protectColumn
}

/**
 * Helper to get the ProtectColumn and column config for a Drizzle column
 * If protectTable is not provided, it will be derived from the column
 */
function getColumnInfo(
  drizzleColumn: SQLWrapper,
  protectTable: ProtectTable<ProtectTableColumn> | undefined,
  protectTableCache: Map<string, ProtectTable<ProtectTableColumn>>,
): {
  protectColumn: ProtectColumn | undefined
  config: (EncryptedColumnConfig & { name: string }) | undefined
  protectTable: ProtectTable<ProtectTableColumn> | undefined
} {
  // If protectTable not provided, try to derive it from the column
  let resolvedProtectTable = protectTable
  if (!resolvedProtectTable) {
    resolvedProtectTable = getProtectTableFromColumn(
      drizzleColumn,
      protectTableCache,
    )
  }

  if (!resolvedProtectTable) {
    // Column is not from an encrypted table
    const drizzleColumnAny = drizzleColumn as unknown as Record<string, unknown>
    const columnName = drizzleColumnAny.name as string | undefined
    const config = columnName
      ? getEncryptedColumnConfig(columnName, drizzleColumn)
      : undefined
    return { protectColumn: undefined, config, protectTable: undefined }
  }

  const protectColumn = getProtectColumn(drizzleColumn, resolvedProtectTable)

  // Also get config from the Drizzle column itself
  const drizzleColumnAny = drizzleColumn as unknown as Record<string, unknown>
  const columnName = drizzleColumnAny.name as string | undefined
  const config = columnName
    ? getEncryptedColumnConfig(columnName, drizzleColumn)
    : undefined

  return { protectColumn, config, protectTable: resolvedProtectTable }
}

/**
 * Lazy operator wrapper that can be collected and batched
 */
interface LazyOperator {
  readonly __isLazyOperator: true
  operator: string
  left: SQLWrapper
  right: unknown
  min?: unknown
  max?: unknown
  createCondition: (
    encrypted: unknown,
    encryptedMin?: unknown,
    encryptedMax?: unknown,
  ) => SQL
  needsEncryption: boolean
}

/**
 * Promise-like object that also contains lazy operator metadata
 * This allows operators to return both a Promise and metadata that can be collected
 */
class LazyOperatorPromise implements LazyOperator, Promise<SQL> {
  readonly __isLazyOperator = true as const
  readonly [Symbol.toStringTag] = 'Promise'
  operator: string
  left: SQLWrapper
  right: unknown
  min?: unknown
  max?: unknown
  createCondition: (
    encrypted: unknown,
    encryptedMin?: unknown,
    encryptedMax?: unknown,
  ) => SQL
  needsEncryption: boolean
  private _promise: Promise<SQL>
  private _resolve?: (value: SQL) => void
  private _reject?: (reason?: unknown) => void
  private _resolved = false
  private _executing = false
  private _protectClient: ProtectClient
  private _defaultProtectTable: ProtectTable<ProtectTableColumn> | undefined
  private _protectTableCache: Map<string, ProtectTable<ProtectTableColumn>>

  constructor(
    operator: string,
    left: SQLWrapper,
    right: unknown,
    createCondition: (
      encrypted: unknown,
      encryptedMin?: unknown,
      encryptedMax?: unknown,
    ) => SQL,
    needsEncryption: boolean,
    protectClient: ProtectClient,
    defaultProtectTable: ProtectTable<ProtectTableColumn> | undefined,
    protectTableCache: Map<string, ProtectTable<ProtectTableColumn>>,
    min?: unknown,
    max?: unknown,
  ) {
    let resolveFn!: (value: SQL) => void
    let rejectFn!: (reason?: unknown) => void
    this._promise = new Promise<SQL>((resolve, reject) => {
      resolveFn = resolve
      rejectFn = reject
    })
    this._resolve = resolveFn
    this._reject = rejectFn
    this.operator = operator
    this.left = left
    this.right = right
    this.min = min
    this.max = max
    this.createCondition = createCondition
    this.needsEncryption = needsEncryption
    this._protectClient = protectClient
    this._defaultProtectTable = defaultProtectTable
    this._protectTableCache = protectTableCache

    // Auto-execute when awaited directly (not in and())
    // Use queueMicrotask to defer, allowing and() to collect first
    queueMicrotask(() => {
      if (!this._resolved && !this._executing && this._resolve) {
        this._executing = true
        this._execute().catch((error) => {
          if (this._reject && !this._resolved) {
            this.rejectWith(error)
          }
        })
      }
    })
  }

  // Implement Promise interface
  then<TResult1 = SQL, TResult2 = never>(
    onfulfilled?:
      | ((value: SQL) => TResult1 | PromiseLike<TResult1>)
      | null
      | undefined,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null
      | undefined,
  ): Promise<TResult1 | TResult2> {
    // Trigger execution if not already started
    if (!this._resolved && !this._executing && this._resolve) {
      this._executing = true
      this._execute().catch((error) => {
        if (this._reject && !this._resolved) {
          this.rejectWith(error)
        }
      })
    }
    return this._promise.then(onfulfilled, onrejected)
  }

  catch<TResult = never>(
    onrejected?:
      | ((reason: unknown) => TResult | PromiseLike<TResult>)
      | null
      | undefined,
  ): Promise<SQL | TResult> {
    // Trigger execution if not already started
    if (!this._resolved && !this._executing && this._resolve) {
      this._executing = true
      this._execute().catch((error) => {
        if (this._reject && !this._resolved) {
          this.rejectWith(error)
        }
      })
    }
    return this._promise.catch(onrejected)
  }

  finally(onfinally?: (() => void) | null | undefined): Promise<SQL> {
    return this._promise.finally(onfinally)
  }

  /**
   * Auto-execute encryption when awaited directly (not in and())
   */
  private async _execute(): Promise<void> {
    if (this._resolved || !this._resolve) {
      return
    }

    try {
      if (this.needsEncryption) {
        if (this.min !== undefined && this.max !== undefined) {
          // Between operator - encrypt min and max
          const [encryptedMin, encryptedMax] = await encryptValues(
            this._protectClient,
            [
              { value: this.min, column: this.left },
              { value: this.max, column: this.left },
            ],
            this._defaultProtectTable,
            this._protectTableCache,
          )
          const sql = this.createCondition(
            undefined,
            encryptedMin,
            encryptedMax,
          )
          this.resolveWith(sql)
        } else {
          // Single value operator
          const encrypted = await encryptValue(
            this._protectClient,
            this.right,
            this.left,
            this._defaultProtectTable,
            this._protectTableCache,
          )
          const sql = this.createCondition(encrypted)
          this.resolveWith(sql)
        }
      } else {
        // Operator doesn't need encryption
        const sql = this.createCondition(this.right)
        this.resolveWith(sql)
      }
    } catch (error) {
      this.rejectWith(error)
    }
  }

  /**
   * Resolve this promise with the given SQL
   * Called by and() after batching encryption or by _execute() when awaited directly
   */
  resolveWith(sql: SQL): void {
    if (this._resolve && !this._resolved) {
      this._resolved = true
      this._resolve(sql)
    }
  }

  /**
   * Reject this promise with the given error
   */
  rejectWith(error: unknown): void {
    if (this._reject && !this._resolved) {
      this._resolved = true
      this._reject(error)
    }
  }
}

/**
 * Type guard to check if a value is a lazy operator
 */
function isLazyOperator(value: unknown): value is LazyOperator {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__isLazyOperator' in value &&
    (value as LazyOperator).__isLazyOperator === true
  )
}

/**
 * Helper to convert a value to plaintext format
 */
function toPlaintext(value: unknown): string | number {
  if (typeof value === 'boolean') {
    return value ? 1 : 0
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return value
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  return String(value)
}

/**
 * Helper to encrypt multiple values for use in a query
 * Returns an array of encrypted search terms or original values if not encrypted
 */
async function encryptValues(
  protectClient: ProtectClient,
  values: Array<{ value: unknown; column: SQLWrapper }>,
  protectTable: ProtectTable<ProtectTableColumn> | undefined,
  protectTableCache: Map<string, ProtectTable<ProtectTableColumn>>,
): Promise<unknown[]> {
  if (values.length === 0) {
    return []
  }

  // Group values by column to batch encrypt with same column/table
  const columnGroups = new Map<
    string,
    {
      column: ProtectColumn
      table: ProtectTable<ProtectTableColumn>
      values: Array<{ value: string | number; index: number }>
    }
  >()

  const results: unknown[] = new Array(values.length)

  for (let i = 0; i < values.length; i++) {
    const { value, column } = values[i]
    const {
      protectColumn,
      config,
      protectTable: resolvedProtectTable,
    } = getColumnInfo(column, protectTable, protectTableCache)

    if (!protectColumn || !config || !resolvedProtectTable) {
      // Column is not encrypted, return value as-is
      results[i] = value
      continue
    }

    const columnName = config.name
    if (!columnGroups.has(columnName)) {
      columnGroups.set(columnName, {
        column: protectColumn,
        table: resolvedProtectTable,
        values: [],
      })
    }

    const plaintextValue = toPlaintext(value)
    const group = columnGroups.get(columnName)
    if (group) {
      group.values.push({
        value: plaintextValue,
        index: i,
      })
    }
  }

  // Encrypt all values for each column in batches
  for (const [columnName, group] of columnGroups) {
    const searchTerms = await protectClient.createSearchTerms(
      group.values.map((v) => ({
        value: v.value,
        column: group.column,
        table: group.table,
      })),
    )

    if (searchTerms.failure) {
      throw new Error(
        `Failed to create search terms: ${searchTerms.failure.message}`,
      )
    }

    // Map results back to original indices
    for (let i = 0; i < group.values.length; i++) {
      const originalIndex = group.values[i].index
      results[originalIndex] = searchTerms.data[i]
    }
  }

  return results
}

/**
 * Helper to encrypt a single value for use in a query
 * Returns the encrypted search term or the original value if not encrypted
 */
async function encryptValue(
  protectClient: ProtectClient,
  value: unknown,
  drizzleColumn: SQLWrapper,
  protectTable: ProtectTable<ProtectTableColumn> | undefined,
  protectTableCache: Map<string, ProtectTable<ProtectTableColumn>>,
): Promise<unknown> {
  const results = await encryptValues(
    protectClient,
    [{ value, column: drizzleColumn }],
    protectTable,
    protectTableCache,
  )
  return results[0]
}

/**
 * Creates a set of Protect.js-aware operators that automatically encrypt values
 * for encrypted columns before using them with Drizzle operators.
 *
 * For equality and text search operators (eq, ne, like, ilike, inArray, etc.):
 * Values are encrypted and then passed to regular Drizzle operators, which use
 * PostgreSQL's built-in operators for eql_v2_encrypted types.
 *
 * For order and range operators (gt, gte, lt, lte, between, notBetween):
 * Values are encrypted and then use eql_v2.* functions (eql_v2.gt(), eql_v2.gte(), etc.)
 * which are required for ORE (Order-Revealing Encryption) comparisons.
 *
 * @param protectClient - The Protect.js client instance
 * @param protectTableOrDrizzleTables - Optional: The Protect.js table schema (from extractProtectSchema) or Drizzle table(s) to pre-populate the cache
 * @param ...drizzleTables - Optional: Additional Drizzle tables for caching (only used if first param is protectClient only)
 * @returns An object with all Drizzle operators wrapped for encrypted columns
 *
 * @example
 * ```ts
 * // With explicit protect table (backward compatible)
 * const protectOps = createProtectOperators(protectClient, users)
 *
 * // With just protectClient - tables are derived from columns
 * const protectOps = createProtectOperators(protectClient)
 *
 * // With drizzle tables for pre-populating cache
 * const protectOps = createProtectOperators(protectClient, drizzleUsersTable, drizzlePostsTable)
 *
 * // Equality search - automatically encrypts and uses PostgreSQL operators
 * const results = await db
 *   .select()
 *   .from(usersTable)
 *   .where(await protectOps.eq(usersTable.email, 'user@example.com'))
 *
 * // Range query - automatically encrypts and uses eql_v2.gte()
 * const olderUsers = await db
 *   .select()
 *   .from(usersTable)
 *   .where(await protectOps.gte(usersTable.age, 25))
 * ```
 */
export function createProtectOperators(protectClient: ProtectClient): {
  // Comparison operators
  eq: (left: SQLWrapper, right: unknown) => Promise<SQL> | SQL
  ne: (left: SQLWrapper, right: unknown) => Promise<SQL> | SQL
  gt: (left: SQLWrapper, right: unknown) => Promise<SQL> | SQL
  gte: (left: SQLWrapper, right: unknown) => Promise<SQL> | SQL
  lt: (left: SQLWrapper, right: unknown) => Promise<SQL> | SQL
  lte: (left: SQLWrapper, right: unknown) => Promise<SQL> | SQL
  // Range operators
  between: (left: SQLWrapper, min: unknown, max: unknown) => Promise<SQL> | SQL
  notBetween: (
    left: SQLWrapper,
    min: unknown,
    max: unknown,
  ) => Promise<SQL> | SQL
  // Text search operators
  like: (left: SQLWrapper, right: unknown) => Promise<SQL> | SQL
  ilike: (left: SQLWrapper, right: unknown) => Promise<SQL> | SQL
  notIlike: (left: SQLWrapper, right: unknown) => Promise<SQL> | SQL
  // Array operators
  inArray: (left: SQLWrapper, right: unknown[] | SQLWrapper) => Promise<SQL>
  notInArray: (left: SQLWrapper, right: unknown[] | SQLWrapper) => Promise<SQL>
  // Sorting operators
  asc: (column: SQLWrapper) => SQL
  desc: (column: SQLWrapper) => SQL
  // Operators that don't need encryption (pass through to Drizzle)
  exists: typeof exists
  notExists: typeof notExists
  isNull: typeof isNull
  isNotNull: typeof isNotNull
  not: typeof not
  and: (
    ...conditions: (SQL | SQLWrapper | Promise<SQL> | undefined)[]
  ) => Promise<SQL>
  or: typeof or
  // Array operators that work with arrays directly (not encrypted values)
  arrayContains: typeof arrayContains
  arrayContained: typeof arrayContained
  arrayOverlaps: typeof arrayOverlaps
} {
  // Create a cache for protect tables keyed by table name
  const protectTableCache = new Map<string, ProtectTable<ProtectTableColumn>>()

  // Determine the default protectTable (for backward compatibility)
  let defaultProtectTable: ProtectTable<ProtectTableColumn> | undefined

  /**
   * Equality operator - encrypts value and uses regular Drizzle operator
   */
  const protectEq = (left: SQLWrapper, right: unknown): Promise<SQL> | SQL => {
    const { config } = getColumnInfo(
      left,
      defaultProtectTable,
      protectTableCache,
    )

    if (config?.equality) {
      return new LazyOperatorPromise(
        'eq',
        left,
        right,
        (encrypted) => eq(left, encrypted),
        true,
        protectClient,
        defaultProtectTable,
        protectTableCache,
      )
    }

    return eq(left, right)
  }

  /**
   * Not equal operator - encrypts value and uses regular Drizzle operator
   */
  const protectNe = (left: SQLWrapper, right: unknown): Promise<SQL> | SQL => {
    const { config } = getColumnInfo(
      left,
      defaultProtectTable,
      protectTableCache,
    )

    if (config?.equality) {
      return new LazyOperatorPromise(
        'ne',
        left,
        right,
        (encrypted) => ne(left, encrypted),
        true,
        protectClient,
        defaultProtectTable,
        protectTableCache,
      )
    }

    return ne(left, right)
  }

  /**
   * Greater than operator - uses eql_v2.gt() for encrypted columns with ORE index
   */
  const protectGt = (left: SQLWrapper, right: unknown): Promise<SQL> | SQL => {
    const { config } = getColumnInfo(
      left,
      defaultProtectTable,
      protectTableCache,
    )

    if (config?.orderAndRange) {
      return new LazyOperatorPromise(
        'gt',
        left,
        right,
        (encrypted) => sql`eql_v2.gt(${left}, ${bindIfParam(encrypted, left)})`,
        true,
        protectClient,
        defaultProtectTable,
        protectTableCache,
      )
    }

    return gt(left, right)
  }

  /**
   * Greater than or equal operator - uses eql_v2.gte() for encrypted columns with ORE index
   */
  const protectGte = (left: SQLWrapper, right: unknown): Promise<SQL> | SQL => {
    const { config } = getColumnInfo(
      left,
      defaultProtectTable,
      protectTableCache,
    )

    if (config?.orderAndRange) {
      return new LazyOperatorPromise(
        'gte',
        left,
        right,
        (encrypted) =>
          sql`eql_v2.gte(${left}, ${bindIfParam(encrypted, left)})`,
        true,
        protectClient,
        defaultProtectTable,
        protectTableCache,
      )
    }

    return gte(left, right)
  }

  /**
   * Less than operator - uses eql_v2.lt() for encrypted columns with ORE index
   */
  const protectLt = (left: SQLWrapper, right: unknown): Promise<SQL> | SQL => {
    const { config } = getColumnInfo(
      left,
      defaultProtectTable,
      protectTableCache,
    )

    if (config?.orderAndRange) {
      return new LazyOperatorPromise(
        'lt',
        left,
        right,
        (encrypted) => sql`eql_v2.lt(${left}, ${bindIfParam(encrypted, left)})`,
        true,
        protectClient,
        defaultProtectTable,
        protectTableCache,
      )
    }

    return lt(left, right)
  }

  /**
   * Less than or equal operator - uses eql_v2.lte() for encrypted columns with ORE index
   */
  const protectLte = (left: SQLWrapper, right: unknown): Promise<SQL> | SQL => {
    const { config } = getColumnInfo(
      left,
      defaultProtectTable,
      protectTableCache,
    )

    if (config?.orderAndRange) {
      return new LazyOperatorPromise(
        'lte',
        left,
        right,
        (encrypted) =>
          sql`eql_v2.lte(${left}, ${bindIfParam(encrypted, left)})`,
        true,
        protectClient,
        defaultProtectTable,
        protectTableCache,
      )
    }

    return lte(left, right)
  }

  /**
   * Between operator - uses eql_v2.gte() and eql_v2.lte() for encrypted columns with ORE index
   */
  const protectBetween = (
    left: SQLWrapper,
    min: unknown,
    max: unknown,
  ): Promise<SQL> | SQL => {
    const { config } = getColumnInfo(
      left,
      defaultProtectTable,
      protectTableCache,
    )

    if (config?.orderAndRange) {
      return new LazyOperatorPromise(
        'between',
        left,
        undefined,
        (encrypted, encryptedMin, encryptedMax) => {
          if (encryptedMin === undefined || encryptedMax === undefined) {
            throw new Error('between operator requires both min and max values')
          }
          return sql`eql_v2.gte(${left}, ${bindIfParam(encryptedMin, left)}) AND eql_v2.lte(${left}, ${bindIfParam(encryptedMax, left)})`
        },
        true,
        protectClient,
        defaultProtectTable,
        protectTableCache,
        min,
        max,
      )
    }

    return between(left, min, max)
  }

  /**
   * Not between operator - uses eql_v2.gte() and eql_v2.lte() for encrypted columns with ORE index
   */
  const protectNotBetween = (
    left: SQLWrapper,
    min: unknown,
    max: unknown,
  ): Promise<SQL> | SQL => {
    const { config } = getColumnInfo(
      left,
      defaultProtectTable,
      protectTableCache,
    )

    if (config?.orderAndRange) {
      return new LazyOperatorPromise(
        'notBetween',
        left,
        undefined,
        (encrypted, encryptedMin, encryptedMax) => {
          if (encryptedMin === undefined || encryptedMax === undefined) {
            throw new Error(
              'notBetween operator requires both min and max values',
            )
          }
          return sql`NOT (eql_v2.gte(${left}, ${bindIfParam(encryptedMin, left)}) AND eql_v2.lte(${left}, ${bindIfParam(encryptedMax, left)}))`
        },
        true,
        protectClient,
        defaultProtectTable,
        protectTableCache,
        min,
        max,
      )
    }

    return notBetween(left, min, max)
  }

  /**
   * Like operator - encrypts value and uses eql_v2.like() for encrypted columns with match index
   */
  const protectLike = (
    left: SQLWrapper,
    right: unknown,
  ): Promise<SQL> | SQL => {
    const { config } = getColumnInfo(
      left,
      defaultProtectTable,
      protectTableCache,
    )

    if (config?.freeTextSearch) {
      return new LazyOperatorPromise(
        'like',
        left,
        right,
        (encrypted) =>
          sql`eql_v2.like(${left}, ${bindIfParam(encrypted, left)})`,
        true,
        protectClient,
        defaultProtectTable,
        protectTableCache,
      )
    }

    // Cast to satisfy TypeScript - like accepts SQLWrapper and string
    return like(
      left as Parameters<typeof like>[0],
      right as string | SQLWrapper,
    )
  }

  /**
   * Case-insensitive like operator - encrypts value and uses eql_v2.ilike() for encrypted columns with match index
   */
  const protectIlike = (
    left: SQLWrapper,
    right: unknown,
  ): Promise<SQL> | SQL => {
    const { config } = getColumnInfo(
      left,
      defaultProtectTable,
      protectTableCache,
    )

    if (config?.freeTextSearch) {
      return new LazyOperatorPromise(
        'ilike',
        left,
        right,
        (encrypted) =>
          sql`eql_v2.ilike(${left}, ${bindIfParam(encrypted, left)})`,
        true,
        protectClient,
        defaultProtectTable,
        protectTableCache,
      )
    }

    // Cast to satisfy TypeScript - ilike accepts SQLWrapper and string
    return ilike(
      left as Parameters<typeof ilike>[0],
      right as string | SQLWrapper,
    )
  }

  /**
   * Not like operator (case insensitive) - encrypts value and uses eql_v2.ilike() for encrypted columns with match index
   */
  const protectNotIlike = (
    left: SQLWrapper,
    right: unknown,
  ): Promise<SQL> | SQL => {
    const { config } = getColumnInfo(
      left,
      defaultProtectTable,
      protectTableCache,
    )

    if (config?.freeTextSearch) {
      return new LazyOperatorPromise(
        'notIlike',
        left,
        right,
        (encrypted) =>
          sql`NOT eql_v2.ilike(${left}, ${bindIfParam(encrypted, left)})`,
        true,
        protectClient,
        defaultProtectTable,
        protectTableCache,
      )
    }

    // Cast to satisfy TypeScript - notIlike accepts SQLWrapper and string
    return notIlike(
      left as Parameters<typeof notIlike>[0],
      right as string | SQLWrapper,
    )
  }

  /**
   * In array operator - encrypts all values in the array
   */
  const protectInArray = async (
    left: SQLWrapper,
    right: unknown[] | SQLWrapper,
  ): Promise<SQL> => {
    const { config } = getColumnInfo(
      left,
      defaultProtectTable,
      protectTableCache,
    )

    // If right is a SQLWrapper (subquery), pass through to Drizzle
    // Check if it's a SQLWrapper by checking for sql property
    if (
      typeof right === 'object' &&
      right !== null &&
      'sql' in right &&
      !Array.isArray(right)
    ) {
      // Cast to satisfy TypeScript - inArray accepts SQLWrapper for subqueries
      // SQLWrapper is compatible with the second parameter of inArray
      return inArray(left, right as unknown as Parameters<typeof inArray>[1])
    }

    if (config?.equality && Array.isArray(right)) {
      // Encrypt all values in the array in a single batch
      const encryptedValues = await encryptValues(
        protectClient,
        right.map((value) => ({ value, column: left })),
        defaultProtectTable,
        protectTableCache,
      )
      // Use regular eq for each encrypted value - PostgreSQL operators handle it
      const conditions = encryptedValues.map((encrypted) => eq(left, encrypted))
      // Combine with OR
      if (conditions.length === 0) {
        return sql`false`
      }
      const combined = or(...conditions)
      return combined ?? sql`false`
    }

    return inArray(left, right as unknown[])
  }

  /**
   * Not in array operator
   */
  const protectNotInArray = async (
    left: SQLWrapper,
    right: unknown[] | SQLWrapper,
  ): Promise<SQL> => {
    const { config } = getColumnInfo(
      left,
      defaultProtectTable,
      protectTableCache,
    )

    // If right is a SQLWrapper (subquery), pass through to Drizzle
    // Check if it's a SQLWrapper by checking for sql property
    if (
      typeof right === 'object' &&
      right !== null &&
      'sql' in right &&
      !Array.isArray(right)
    ) {
      // Cast to satisfy TypeScript - notInArray accepts SQLWrapper for subqueries
      // SQLWrapper is compatible with the second parameter of notInArray
      return notInArray(
        left,
        right as unknown as Parameters<typeof notInArray>[1],
      )
    }

    if (config?.equality && Array.isArray(right)) {
      // Encrypt all values in the array in a single batch
      const encryptedValues = await encryptValues(
        protectClient,
        right.map((value) => ({ value, column: left })),
        defaultProtectTable,
        protectTableCache,
      )
      // Use regular ne for each encrypted value - PostgreSQL operators handle it
      const conditions = encryptedValues.map((encrypted) => ne(left, encrypted))
      // Combine with AND
      if (conditions.length === 0) {
        return sql`true`
      }
      const combined = and(...conditions)
      return combined ?? sql`true`
    }

    return notInArray(left, right as unknown[])
  }

  /**
   * Ascending order helper - uses eql_v2.order_by() for encrypted columns with ORE index
   */
  const protectAsc = (column: SQLWrapper): SQL => {
    const { config } = getColumnInfo(
      column,
      defaultProtectTable,
      protectTableCache,
    )

    if (config?.orderAndRange) {
      // Use eql_v2.order_by() function for encrypted columns
      return asc(sql`eql_v2.order_by(${column})`)
    }

    // Regular column ordering
    return asc(column)
  }

  /**
   * Descending order helper - uses eql_v2.order_by() for encrypted columns with ORE index
   */
  const protectDesc = (column: SQLWrapper): SQL => {
    const { config } = getColumnInfo(
      column,
      defaultProtectTable,
      protectTableCache,
    )

    if (config?.orderAndRange) {
      // Use eql_v2.order_by() function for encrypted columns
      return desc(sql`eql_v2.order_by(${column})`)
    }

    // Regular column ordering
    return desc(column)
  }

  /**
   * Batched AND operator - collects lazy operators, batches encryption, and combines conditions
   */
  const protectAnd = async (
    ...conditions: (SQL | SQLWrapper | Promise<SQL> | undefined)[]
  ): Promise<SQL> => {
    // Separate lazy operators from regular conditions
    const lazyOperators: LazyOperatorPromise[] = []
    const regularConditions: (SQL | SQLWrapper | undefined)[] = []
    const regularPromises: Promise<SQL>[] = []

    for (const condition of conditions) {
      if (condition === undefined) {
        continue
      }

      // Check if it's a lazy operator
      if (isLazyOperator(condition)) {
        lazyOperators.push(condition as LazyOperatorPromise)
      } else if (condition instanceof Promise) {
        // Regular promise - check if it's a lazy operator promise
        if (isLazyOperator(condition)) {
          lazyOperators.push(condition as LazyOperatorPromise)
        } else {
          regularPromises.push(condition)
        }
      } else {
        // Regular SQL/SQLWrapper
        regularConditions.push(condition)
      }
    }

    // If there are no lazy operators, just use Drizzle's and()
    if (lazyOperators.length === 0) {
      const allConditions: (SQL | SQLWrapper | undefined)[] = [
        ...regularConditions,
        ...(await Promise.all(regularPromises)),
      ]
      return and(...allConditions) ?? sql`true`
    }

    // Collect all values to encrypt from lazy operators
    const valuesToEncrypt: Array<{ value: unknown; column: SQLWrapper }> = []
    const lazyOperatorIndices: number[] = []

    for (let i = 0; i < lazyOperators.length; i++) {
      const lazyOp = lazyOperators[i]
      if (lazyOp.needsEncryption) {
        // For between operators, we have min and max
        if (lazyOp.min !== undefined && lazyOp.max !== undefined) {
          valuesToEncrypt.push({ value: lazyOp.min, column: lazyOp.left })
          valuesToEncrypt.push({ value: lazyOp.max, column: lazyOp.left })
          lazyOperatorIndices.push(i, i) // Track both min and max
        } else {
          valuesToEncrypt.push({ value: lazyOp.right, column: lazyOp.left })
          lazyOperatorIndices.push(i)
        }
      }
    }

    // Batch encrypt all values
    let encryptedValues: unknown[] = []
    if (valuesToEncrypt.length > 0) {
      encryptedValues = await encryptValues(
        protectClient,
        valuesToEncrypt,
        defaultProtectTable,
        protectTableCache,
      )
    }

    // Create SQL conditions for each lazy operator
    const sqlConditions: SQL[] = []
    let encryptedIndex = 0

    for (let i = 0; i < lazyOperators.length; i++) {
      const lazyOp = lazyOperators[i]
      let sqlCondition: SQL

      if (lazyOp.needsEncryption) {
        if (lazyOp.min !== undefined && lazyOp.max !== undefined) {
          // Between operator - use both encrypted values
          const encryptedMin = encryptedValues[encryptedIndex++]
          const encryptedMax = encryptedValues[encryptedIndex++]
          sqlCondition = lazyOp.createCondition(
            undefined,
            encryptedMin,
            encryptedMax,
          )
        } else {
          // Single value operator
          const encrypted = encryptedValues[encryptedIndex++]
          sqlCondition = lazyOp.createCondition(encrypted)
        }
      } else {
        // Operator doesn't need encryption, create condition directly
        sqlCondition = lazyOp.createCondition(lazyOp.right)
      }

      // Resolve the lazy operator promise with the SQL condition
      lazyOp.resolveWith(sqlCondition)
      sqlConditions.push(sqlCondition)
    }

    // Await any regular promises
    const regularPromisesResults = await Promise.all(regularPromises)

    // Combine all conditions
    const allConditions: (SQL | SQLWrapper | undefined)[] = [
      ...regularConditions,
      ...sqlConditions,
      ...regularPromisesResults,
    ]

    return and(...allConditions) ?? sql`true`
  }

  return {
    // Comparison operators
    eq: protectEq,
    ne: protectNe,
    gt: protectGt,
    gte: protectGte,
    lt: protectLt,
    lte: protectLte,

    // Range operators
    between: protectBetween,
    notBetween: protectNotBetween,

    // Text search operators
    like: protectLike,
    ilike: protectIlike,
    notIlike: protectNotIlike,

    // Array operators
    inArray: protectInArray,
    notInArray: protectNotInArray,

    // Sorting operators
    asc: protectAsc,
    desc: protectDesc,

    // Operators that don't need encryption (pass through to Drizzle)
    exists,
    notExists,
    isNull,
    isNotNull,
    not,
    and: protectAnd,
    or,

    // Array operators that work with arrays directly (not encrypted values)
    arrayContains,
    arrayContained,
    arrayOverlaps,
  }
}
