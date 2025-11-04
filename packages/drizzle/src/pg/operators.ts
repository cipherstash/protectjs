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
  eq: (left: SQLWrapper, right: unknown) => Promise<SQL>
  ne: (left: SQLWrapper, right: unknown) => Promise<SQL>
  gt: (left: SQLWrapper, right: unknown) => Promise<SQL>
  gte: (left: SQLWrapper, right: unknown) => Promise<SQL>
  lt: (left: SQLWrapper, right: unknown) => Promise<SQL>
  lte: (left: SQLWrapper, right: unknown) => Promise<SQL>
  // Range operators
  between: (left: SQLWrapper, min: unknown, max: unknown) => Promise<SQL>
  notBetween: (left: SQLWrapper, min: unknown, max: unknown) => Promise<SQL>
  // Text search operators
  like: (left: SQLWrapper, right: unknown) => Promise<SQL>
  ilike: (left: SQLWrapper, right: unknown) => Promise<SQL>
  notIlike: (left: SQLWrapper, right: unknown) => Promise<SQL>
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
  and: typeof and
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
  const protectEq = async (left: SQLWrapper, right: unknown): Promise<SQL> => {
    const { config } = getColumnInfo(
      left,
      defaultProtectTable,
      protectTableCache,
    )

    if (config?.equality) {
      const encrypted = await encryptValue(
        protectClient,
        right,
        left,
        defaultProtectTable,
        protectTableCache,
      )
      // Use regular Drizzle eq - PostgreSQL operators handle encrypted comparison
      return eq(left, encrypted)
    }

    return eq(left, right)
  }

  /**
   * Not equal operator - encrypts value and uses regular Drizzle operator
   */
  const protectNe = async (left: SQLWrapper, right: unknown): Promise<SQL> => {
    const { config } = getColumnInfo(
      left,
      defaultProtectTable,
      protectTableCache,
    )

    if (config?.equality) {
      const encrypted = await encryptValue(
        protectClient,
        right,
        left,
        defaultProtectTable,
        protectTableCache,
      )
      // Use regular Drizzle ne - PostgreSQL operators handle encrypted comparison
      return ne(left, encrypted)
    }

    return ne(left, right)
  }

  /**
   * Greater than operator - uses eql_v2.gt() for encrypted columns with ORE index
   */
  const protectGt = async (left: SQLWrapper, right: unknown): Promise<SQL> => {
    const { config } = getColumnInfo(
      left,
      defaultProtectTable,
      protectTableCache,
    )

    if (config?.orderAndRange) {
      const encrypted = await encryptValue(
        protectClient,
        right,
        left,
        defaultProtectTable,
        protectTableCache,
      )
      return sql`eql_v2.gt(${left}, ${bindIfParam(encrypted, left)})`
    }

    return gt(left, right)
  }

  /**
   * Greater than or equal operator - uses eql_v2.gte() for encrypted columns with ORE index
   */
  const protectGte = async (left: SQLWrapper, right: unknown): Promise<SQL> => {
    const { config } = getColumnInfo(
      left,
      defaultProtectTable,
      protectTableCache,
    )

    if (config?.orderAndRange) {
      const encrypted = await encryptValue(
        protectClient,
        right,
        left,
        defaultProtectTable,
        protectTableCache,
      )
      return sql`eql_v2.gte(${left}, ${bindIfParam(encrypted, left)})`
    }

    return gte(left, right)
  }

  /**
   * Less than operator - uses eql_v2.lt() for encrypted columns with ORE index
   */
  const protectLt = async (left: SQLWrapper, right: unknown): Promise<SQL> => {
    const { config } = getColumnInfo(
      left,
      defaultProtectTable,
      protectTableCache,
    )

    if (config?.orderAndRange) {
      const encrypted = await encryptValue(
        protectClient,
        right,
        left,
        defaultProtectTable,
        protectTableCache,
      )
      return sql`eql_v2.lt(${left}, ${bindIfParam(encrypted, left)})`
    }

    return lt(left, right)
  }

  /**
   * Less than or equal operator - uses eql_v2.lte() for encrypted columns with ORE index
   */
  const protectLte = async (left: SQLWrapper, right: unknown): Promise<SQL> => {
    const { config } = getColumnInfo(
      left,
      defaultProtectTable,
      protectTableCache,
    )

    if (config?.orderAndRange) {
      const encrypted = await encryptValue(
        protectClient,
        right,
        left,
        defaultProtectTable,
        protectTableCache,
      )
      return sql`eql_v2.lte(${left}, ${bindIfParam(encrypted, left)})`
    }

    return lte(left, right)
  }

  /**
   * Between operator - uses eql_v2.gte() and eql_v2.lte() for encrypted columns with ORE index
   */
  const protectBetween = async (
    left: SQLWrapper,
    min: unknown,
    max: unknown,
  ): Promise<SQL> => {
    const { config } = getColumnInfo(
      left,
      defaultProtectTable,
      protectTableCache,
    )

    if (config?.orderAndRange) {
      const [encryptedMin, encryptedMax] = await encryptValues(
        protectClient,
        [
          { value: min, column: left },
          { value: max, column: left },
        ],
        defaultProtectTable,
        protectTableCache,
      )
      return sql`eql_v2.gte(${left}, ${bindIfParam(encryptedMin, left)}) AND eql_v2.lte(${left}, ${bindIfParam(encryptedMax, left)})`
    }

    return between(left, min, max)
  }

  /**
   * Not between operator - uses eql_v2.gte() and eql_v2.lte() for encrypted columns with ORE index
   */
  const protectNotBetween = async (
    left: SQLWrapper,
    min: unknown,
    max: unknown,
  ): Promise<SQL> => {
    const { config } = getColumnInfo(
      left,
      defaultProtectTable,
      protectTableCache,
    )

    if (config?.orderAndRange) {
      const [encryptedMin, encryptedMax] = await encryptValues(
        protectClient,
        [
          { value: min, column: left },
          { value: max, column: left },
        ],
        defaultProtectTable,
        protectTableCache,
      )
      return sql`NOT (eql_v2.gte(${left}, ${bindIfParam(encryptedMin, left)}) AND eql_v2.lte(${left}, ${bindIfParam(encryptedMax, left)}))`
    }

    return notBetween(left, min, max)
  }

  /**
   * Like operator - encrypts value and uses eql_v2.like() for encrypted columns with match index
   */
  const protectLike = async (
    left: SQLWrapper,
    right: unknown,
  ): Promise<SQL> => {
    const { config } = getColumnInfo(
      left,
      defaultProtectTable,
      protectTableCache,
    )

    if (config?.freeTextSearch) {
      const encrypted = await encryptValue(
        protectClient,
        right,
        left,
        defaultProtectTable,
        protectTableCache,
      )
      return sql`eql_v2.like(${left}, ${bindIfParam(encrypted, left)})`
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
  const protectIlike = async (
    left: SQLWrapper,
    right: unknown,
  ): Promise<SQL> => {
    const { config } = getColumnInfo(
      left,
      defaultProtectTable,
      protectTableCache,
    )

    if (config?.freeTextSearch) {
      const encrypted = await encryptValue(
        protectClient,
        right,
        left,
        defaultProtectTable,
        protectTableCache,
      )
      return sql`eql_v2.ilike(${left}, ${bindIfParam(encrypted, left)})`
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
  const protectNotIlike = async (
    left: SQLWrapper,
    right: unknown,
  ): Promise<SQL> => {
    const { config } = getColumnInfo(
      left,
      defaultProtectTable,
      protectTableCache,
    )

    if (config?.freeTextSearch) {
      const encrypted = await encryptValue(
        protectClient,
        right,
        left,
        defaultProtectTable,
        protectTableCache,
      )
      return sql`NOT eql_v2.ilike(${left}, ${bindIfParam(encrypted, left)})`
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
    and,
    or,

    // Array operators that work with arrays directly (not encrypted values)
    arrayContains,
    arrayContained,
    arrayOverlaps,
  }
}
