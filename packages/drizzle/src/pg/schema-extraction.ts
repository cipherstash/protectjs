import { type ProtectColumn, csColumn, csTable } from '@cipherstash/schema'
import type { ProtectTable, ProtectTableColumn } from '@cipherstash/schema'
import type { PgTable } from 'drizzle-orm/pg-core'
import { getEncryptedColumnConfig } from './index.js'

/**
 * Extracts a Protect.js schema from a Drizzle table definition.
 * This function identifies columns created with `encryptedType` and
 * builds a corresponding `ProtectTable` with `csColumn` definitions.
 *
 * @param table - The Drizzle table definition
 * @returns A ProtectTable that can be used with `protect()` initialization
 *
 * @example
 * ```ts
 * const drizzleUsersTable = pgTable('users', {
 *   email: encryptedType('email', { freeTextSearch: true, equality: true }),
 *   age: encryptedType('age', { dataType: 'number', orderAndRange: true }),
 * })
 *
 * const protectSchema = extractProtectSchema(drizzleUsersTable)
 * const protectClient = await protect({ schemas: [protectSchema] })
 * ```
 */
// We use any for the PgTable generic because we need to access Drizzle's internal properties
// biome-ignore lint/suspicious/noExplicitAny: Drizzle table types don't expose Symbol properties
export function extractProtectSchema<T extends PgTable<any>>(
  table: T,
): ProtectTable<ProtectTableColumn> & ProtectTableColumn {
  // Drizzle tables store the name in a Symbol property
  // biome-ignore lint/suspicious/noExplicitAny: Drizzle tables don't expose Symbol properties in types
  const tableName = (table as any)[Symbol.for('drizzle:Name')] as
    | string
    | undefined
  if (!tableName) {
    throw new Error(
      'Unable to extract table name from Drizzle table. Ensure you are using a table created with pgTable().',
    )
  }

  const columns: Record<string, ProtectColumn> = {}

  // Iterate through table columns
  for (const [columnName, column] of Object.entries(table)) {
    // Skip if it's not a column (could be methods or other properties)
    if (typeof column !== 'object' || column === null) {
      continue
    }

    // Check if this column has encrypted configuration
    const config = getEncryptedColumnConfig(columnName, column)

    if (config) {
      // Extract the actual column name from the column object (not the schema key)
      // Drizzle columns have a 'name' property that contains the actual database column name
      const actualColumnName = column.name || config.name

      // This is an encrypted column - build csColumn using the actual column name
      const csCol = csColumn(actualColumnName)

      // Apply data type
      if (config.dataType && config.dataType !== 'string') {
        csCol.dataType(config.dataType)
      }

      // Apply indexes based on configuration
      if (config.orderAndRange) {
        csCol.orderAndRange()
      }

      if (config.equality) {
        if (Array.isArray(config.equality)) {
          // Custom token filters
          csCol.equality(config.equality)
        } else {
          // Default equality (boolean true)
          csCol.equality()
        }
      }

      if (config.freeTextSearch) {
        if (typeof config.freeTextSearch === 'object') {
          // Custom match options
          csCol.freeTextSearch(config.freeTextSearch)
        } else {
          // Default freeTextSearch (boolean true)
          csCol.freeTextSearch()
        }
      }

      columns[actualColumnName] = csCol
    }
  }

  if (Object.keys(columns).length === 0) {
    throw new Error(
      `No encrypted columns found in table "${tableName}". Use encryptedType() to define encrypted columns.`,
    )
  }

  // csTable returns ProtectTable<T> & T, which makes columns accessible as properties
  // We cast to ensure TypeScript knows the columns are ProtectColumn instances
  // and that they're accessible as properties on the returned object
  type Columns = Record<string, ProtectColumn>
  return csTable(tableName, columns) as unknown as ProtectTable<Columns> &
    Columns
}
