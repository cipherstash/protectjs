import type { CastAs, MatchIndexOpts, TokenFilter } from '@cipherstash/schema'
import { customType } from 'drizzle-orm/pg-core'

/**
 * Configuration for encrypted column indexes and data types
 */
export type EncryptedColumnConfig = {
  /**
   * Data type for the column (default: 'string')
   */
  dataType?: CastAs
  /**
   * Enable free text search. Can be a boolean for default options, or an object for custom configuration.
   */
  freeTextSearch?: boolean | MatchIndexOpts
  /**
   * Enable equality index. Can be a boolean for default options, or an array of token filters.
   */
  equality?: boolean | TokenFilter[]
  /**
   * Enable order and range index for sorting and range queries.
   */
  orderAndRange?: boolean
}

/**
 * Map to store configuration for encrypted columns
 * Keyed by column name (the name passed to encryptedType)
 */
const columnConfigMap = new Map<
  string,
  EncryptedColumnConfig & { name: string }
>()

/**
 * Creates an encrypted column type for Drizzle ORM with configurable searchable encryption options.
 *
 * @param name - The column name in the database
 * @param config - Optional configuration for data type and searchable encryption indexes
 * @returns A Drizzle column type that can be used in pgTable definitions
 *
 * @example
 * ```ts
 * const users = pgTable('users', {
 *   email: encryptedType('email', {
 *     freeTextSearch: true,
 *     equality: true,
 *     orderAndRange: true,
 *   }),
 *   age: encryptedType('age', {
 *     dataType: 'number',
 *     equality: true,
 *     orderAndRange: true,
 *   }),
 *   profile: encryptedType('profile', {
 *     dataType: 'json',
 *   }),
 * })
 * ```
 */
export const encryptedType = <TData>(
  name: string,
  config?: EncryptedColumnConfig,
) => {
  // Create the Drizzle custom type
  const customColumnType = customType<{ data: TData; driverData: string }>({
    dataType() {
      return 'eql_v2_encrypted'
    },
    toDriver(value: TData): string {
      const jsonStr = JSON.stringify(value)
      const escaped = jsonStr.replace(/"/g, '""')
      return `("${escaped}")`
    },
    fromDriver(value: string): TData {
      const parseComposite = (str: string) => {
        if (!str || str === '') return null

        const trimmed = str.trim()

        if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
          let inner = trimmed.slice(1, -1)
          inner = inner.replace(/""/g, '"')

          if (inner.startsWith('"') && inner.endsWith('"')) {
            const stripped = inner.slice(1, -1)
            return JSON.parse(stripped)
          }

          if (inner.startsWith('{') || inner.startsWith('[')) {
            return JSON.parse(inner)
          }

          return inner
        }

        return JSON.parse(str)
      }

      return parseComposite(value) as TData
    },
  })

  // Create the column instance
  const column = customColumnType(name)

  // Store configuration keyed by column name
  // This allows us to look it up during schema extraction
  const fullConfig: EncryptedColumnConfig & { name: string } = {
    name,
    ...config,
  }

  // Store in Map keyed by column name (will be looked up during extraction)
  columnConfigMap.set(name, fullConfig)

  // Also store on property for immediate access (before pgTable processes it)
  // We need to use any here because Drizzle columns don't have a type for custom properties
  // biome-ignore lint/suspicious/noExplicitAny: Drizzle columns don't expose custom property types
  ;(column as any)._protectConfig = fullConfig

  return column
}

/**
 * Get configuration for an encrypted column by checking if it's an encrypted type
 * and looking up the config by column name
 * @internal
 */
export function getEncryptedColumnConfig(
  columnName: string,
  column: unknown,
): (EncryptedColumnConfig & { name: string }) | undefined {
  // Check if this is an encrypted column
  if (column && typeof column === 'object') {
    // We need to use any here to access Drizzle column properties
    // biome-ignore lint/suspicious/noExplicitAny: Drizzle column types don't expose all properties
    const columnAny = column as any

    // Check if it's an encrypted column by checking sqlName or dataType
    // After pgTable processes it, sqlName will be 'eql_v2_encrypted'
    const isEncrypted =
      columnAny.sqlName === 'eql_v2_encrypted' ||
      columnAny.dataType === 'eql_v2_encrypted' ||
      (columnAny.dataType &&
        typeof columnAny.dataType === 'function' &&
        columnAny.dataType() === 'eql_v2_encrypted')

    if (isEncrypted) {
      // Try to get config from property (if still there)
      if (columnAny._protectConfig) {
        return columnAny._protectConfig
      }

      // Look up config by column name (the name passed to encryptedType)
      // The column.name should match what was passed to encryptedType
      const lookupName = columnAny.name || columnName
      return columnConfigMap.get(lookupName)
    }
  }
  return undefined
}

// Re-export schema extraction utility
export { extractProtectSchema } from './schema-extraction.js'

// Re-export operators
export { createProtectOperators } from './operators.js'
