import type { ModelStatic, Model } from 'sequelize'
import { csTable, csColumn } from '@cipherstash/schema'
import type {
  ProtectTable,
  ProtectTableColumn,
} from '@cipherstash/schema'
import { getEncryptedColumnConfig } from './data-type'

/**
 * Extract Protect.js schema from a Sequelize model
 *
 * @param model - Sequelize model with encrypted columns
 * @returns Protect table schema
 * @throws Error if model has no encrypted columns
 */
export function extractProtectSchema<M extends Model>(
  model: ModelStatic<M>
): ProtectTable<ProtectTableColumn> {
  const tableName = model.tableName || model.name
  const attributes = model.getAttributes()

  const columns: Record<string, any> = {}

  for (const [fieldName, attribute] of Object.entries(attributes)) {
    const config = getEncryptedColumnConfig(fieldName)

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
      const tokenFilters = Array.isArray(config.equality)
        ? config.equality
        : [{ kind: 'downcase' }]

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
      `Model ${tableName} has no encrypted columns. Use DataTypes.ENCRYPTED to define encrypted columns.`
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
export function extractProtectSchemas(
  ...models: ModelStatic<any>[]
): ProtectTable<ProtectTableColumn>[] {
  return models.map(extractProtectSchema)
}
