import { csColumn, csTable } from '@cipherstash/schema'
import type {
  ProtectTable,
  ProtectTableColumn,
  TokenFilter,
} from '@cipherstash/schema'
import type { Model, ModelStatic } from 'sequelize'
import { getEncryptedColumnConfig } from './data-type'

/**
 * Extract Protect.js schema from a Sequelize model
 *
 * @param model - Sequelize model with encrypted columns
 * @returns Protect table schema
 * @throws Error if model has no encrypted columns
 */
export function extractProtectSchema<M extends Model>(
  model: ModelStatic<M>,
): ProtectTable<ProtectTableColumn> {
  const tableName = model.tableName || model.name
  const attributes = model.getAttributes()

  // biome-ignore lint/suspicious/noExplicitAny: column config can have any shape
  const columns: Record<string, any> = {}

  for (const [fieldName, attribute] of Object.entries(attributes)) {
    // Get config from the column instance (each ENCRYPTED factory has its own registry)
    const config = getEncryptedColumnConfig(attribute.type, fieldName)

    if (!config) {
      // Not an encrypted column, skip
      continue
    }

    // Determine data type (cast parameter for Protect)
    const dataType = config.dataType || 'string'

    // Build column using builder pattern
    let column = csColumn(fieldName).dataType(dataType)

    // Add indexes based on configuration
    if (config.equality) {
      const tokenFilters: TokenFilter[] = Array.isArray(config.equality)
        ? config.equality
        : [{ kind: 'downcase' } as const]

      column = column.equality(tokenFilters)
    }

    if (config.freeTextSearch) {
      const matchOpts =
        typeof config.freeTextSearch === 'object'
          ? config.freeTextSearch
          : undefined

      column = column.freeTextSearch(matchOpts)
    }

    if (config.orderAndRange) {
      column = column.orderAndRange()
    }

    columns[fieldName] = column
  }

  if (Object.keys(columns).length === 0) {
    throw new Error(
      `Model ${tableName} has no encrypted columns. Use ENCRYPTED type to define encrypted columns`,
    )
  }

  // IMPORTANT: Pass tableName as first parameter to csTable
  return csTable(tableName, columns)
}

/**
 * Helper to extract schemas from multiple models at once
 *
 * @param models - Sequelize models to extract schemas from
 * @returns Array of Protect table schemas
 */
// biome-ignore lint/suspicious/noExplicitAny: accepts models of any shape
export function extractProtectSchemas(
  ...models: ModelStatic<any>[]
): ProtectTable<ProtectTableColumn>[] {
  return models.map(extractProtectSchema)
}
