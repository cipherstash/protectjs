import type { ProtectClient } from '@cipherstash/protect'
import type { ProtectTable, ProtectTableColumn } from '@cipherstash/schema'
import type { FindOptions, Model, ModelStatic } from 'sequelize'
import { Op } from 'sequelize'
import { getEncryptedColumnConfig } from './data-type'
import { extractProtectSchema } from './schema-extraction'

/**
 * Encrypt a single value for searching
 */
async function encryptValue(
  value: any,
  columnName: string,
  protectClient: ProtectClient,
  protectTable: ProtectTable<ProtectTableColumn>,
): Promise<any> {
  const column = (protectTable as any)[columnName]
  if (!column) return value

  const result = await protectClient.createSearchTerms([
    {
      value,
      column,
      table: protectTable,
    },
  ])

  if (result.failure) {
    throw new Error(`Encryption failed: ${result.failure.message}`)
  }

  // Stringify to PostgreSQL composite type format
  const encrypted = result.data[0]
  const jsonStr = JSON.stringify(encrypted)
  const escaped = jsonStr.replace(/"/g, '""')
  return `("${escaped}")`
}

/**
 * Bulk encrypt array of values
 */
async function bulkEncryptValues(
  values: any[],
  columnName: string,
  protectClient: ProtectClient,
  protectTable: ProtectTable<ProtectTableColumn>,
): Promise<any[]> {
  const column = (protectTable as any)[columnName]
  if (!column) return values

  const result = await protectClient.createSearchTerms(
    values.map((value) => ({
      value,
      column,
      table: protectTable,
    })),
  )

  if (result.failure) {
    throw new Error(`Bulk encryption failed: ${result.failure.message}`)
  }

  // Stringify each encrypted value to PostgreSQL composite type format
  return result.data.map((encrypted) => {
    const jsonStr = JSON.stringify(encrypted)
    const escaped = jsonStr.replace(/"/g, '""')
    return `("${escaped}")`
  })
}

/**
 * Transform operators (Op.eq, Op.gt, etc.) for encrypted columns
 */
async function transformOperators(
  operatorValue: any,
  columnName: string,
  columnInstance: any,
  protectClient: ProtectClient,
  protectTable: ProtectTable<ProtectTableColumn>,
): Promise<any> {
  const columnConfig = getEncryptedColumnConfig(columnInstance, columnName)

  // Simple equality: { email: 'test@example.com' }
  if (typeof operatorValue !== 'object' || operatorValue === null) {
    return await encryptValue(
      operatorValue,
      columnName,
      protectClient,
      protectTable,
    )
  }

  const transformed: any = {}

  // Use Reflect.ownKeys to get both string keys and Symbol keys (like Op.eq)
  for (const op of Reflect.ownKeys(operatorValue)) {
    const opValue = operatorValue[op]
    switch (op) {
      case Op.eq:
      case Op.ne:
        if (!columnConfig?.equality) {
          throw new Error(`Column ${columnName} doesn't have equality index`)
        }
        transformed[op] = await encryptValue(
          opValue,
          columnName,
          protectClient,
          protectTable,
        )
        break

      case Op.gt:
      case Op.gte:
      case Op.lt:
      case Op.lte:
        if (!columnConfig?.orderAndRange) {
          throw new Error(
            `Column ${columnName} doesn't have orderAndRange index`,
          )
        }
        transformed[op] = await encryptValue(
          opValue,
          columnName,
          protectClient,
          protectTable,
        )
        break

      case Op.like:
      case Op.iLike:
      case Op.notLike:
      case Op.notILike:
        if (!columnConfig?.freeTextSearch) {
          throw new Error(
            `Column ${columnName} doesn't have freeTextSearch index`,
          )
        }
        transformed[op] = await encryptValue(
          opValue,
          columnName,
          protectClient,
          protectTable,
        )
        break

      case Op.between:
      case Op.notBetween:
        if (!columnConfig?.orderAndRange) {
          throw new Error(
            `Column ${columnName} doesn't have orderAndRange index`,
          )
        }
        if (Array.isArray(opValue) && opValue.length === 2) {
          const [min, max] = await bulkEncryptValues(
            opValue,
            columnName,
            protectClient,
            protectTable,
          )
          transformed[op] = [min, max]
        }
        break

      case Op.in:
      case Op.notIn:
        if (!columnConfig?.equality) {
          throw new Error(`Column ${columnName} doesn't have equality index`)
        }
        if (Array.isArray(opValue)) {
          transformed[op] = await bulkEncryptValues(
            opValue,
            columnName,
            protectClient,
            protectTable,
          )
        }
        break

      default:
        // Pass through other operators unchanged
        transformed[op] = opValue
    }
  }

  return transformed
}

/**
 * Recursively transform WHERE clause to encrypt values for encrypted columns
 */
async function transformWhereClause(
  where: any,
  model: ModelStatic<any>,
  protectClient: ProtectClient,
  protectTable: ProtectTable<ProtectTableColumn>,
): Promise<any> {
  const transformed: any = {}
  const attributes = model.getAttributes()

  // Use Reflect.ownKeys to handle both string keys and Symbol keys (like Op.and, Op.or)
  for (const key of Reflect.ownKeys(where)) {
    const value = (where as any)[key]
    // Handle logical operators (Op.and, Op.or)
    if (key === Op.and || key === Op.or) {
      transformed[key] = await Promise.all(
        (value as any[]).map((clause) =>
          transformWhereClause(clause, model, protectClient, protectTable),
        ),
      )
      continue
    }

    // Only process string keys for column attributes (symbols are operators only)
    if (typeof key !== 'string') {
      transformed[key] = value
      continue
    }

    // Get the column instance from model attributes
    const attribute = attributes[key]
    const columnConfig = attribute
      ? getEncryptedColumnConfig(attribute.type, key)
      : null

    if (!columnConfig) {
      // Not encrypted, keep as-is
      transformed[key] = value
      continue
    }

    // Transform operators for encrypted column
    transformed[key] = await transformOperators(
      value,
      key,
      attribute.type,
      protectClient,
      protectTable,
    )
  }

  return transformed
}

/**
 * Installs beforeFind and afterFind hooks on a Sequelize model
 * to handle transparent encryption/decryption
 */
export function addProtectHooks<M extends Model>(
  model: ModelStatic<M>,
  protectClient: ProtectClient,
): void {
  // Extract Protect schema from Sequelize model
  const protectTable = extractProtectSchema(model)

  /**
   * beforeFind: Transform WHERE clause to encrypt search values
   */
  model.addHook('beforeFind', async (options: FindOptions) => {
    if (!options.where) return

    // Transform WHERE clause recursively
    options.where = await transformWhereClause(
      options.where,
      model,
      protectClient,
      protectTable,
    )
  })

  /**
   * afterFind: Decrypt results
   */
  model.addHook('afterFind', async (result: M | M[] | null) => {
    if (!result) return

    const models = Array.isArray(result) ? result : [result]
    if (models.length === 0) return

    // Parse composite type strings to encrypted objects
    // Note: We parse manually here rather than using bulkFromComposite because:
    // 1. We only parse encrypted columns (more efficient than parsing all fields)
    // 2. We check column config to ensure we only process ENCRYPTED columns
    // 3. This avoids unnecessary parsing of non-encrypted string fields
    const attributes = model.getAttributes()
    const parsedModels = models.map((m) => {
      const plainData = m.get({ plain: true })
      const parsed: Record<string, any> = { ...plainData }

      for (const [key, attribute] of Object.entries(attributes)) {
        const columnConfig = getEncryptedColumnConfig(attribute.type, key)
        if (columnConfig && plainData[key]) {
          // Parse composite type format ("json_string") back to object
          const value = plainData[key]
          if (
            typeof value === 'string' &&
            value.startsWith('("') &&
            value.endsWith('")')
          ) {
            const inner = value.slice(2, -2) // Remove (" and ")
            const unescaped = inner.replace(/""/g, '"') // Unescape quotes
            parsed[key] = JSON.parse(unescaped)
          }
        }
      }
      return parsed
    })

    // Bulk decrypt all models
    const decrypted = await protectClient.bulkDecryptModels(parsedModels)

    if (decrypted.failure) {
      throw new Error(`Decryption failed: ${decrypted.failure.message}`)
    }

    // Update model instances with decrypted values
    for (let i = 0; i < models.length; i++) {
      models[i].set(decrypted.data[i], { raw: true })
    }
  })

  /**
   * beforeBulkCreate: Encrypt values before bulk INSERT
   */
  model.addHook('beforeBulkCreate', async (instances: M[]) => {
    const attributes = model.getAttributes()

    for (const instance of instances) {
      const plainData = instance.get({ plain: true })

      // Collect encrypted column values
      const encryptedColumns: Array<{
        key: string
        value: any
        column: any
      }> = []

      for (const [key, attribute] of Object.entries(attributes)) {
        const columnConfig = getEncryptedColumnConfig(attribute.type, key)
        if (
          columnConfig &&
          plainData[key] !== undefined &&
          plainData[key] !== null
        ) {
          encryptedColumns.push({
            key,
            value: plainData[key],
            column: (protectTable as any)[key],
          })
        }
      }

      if (encryptedColumns.length === 0) continue

      // Encrypt each column value
      const encryptionPromises = encryptedColumns.map(
        async ({ key, value, column }) => {
          const result = await protectClient.encrypt(value, {
            column,
            table: protectTable,
          })

          if (result.failure) {
            throw new Error(
              `Encryption failed for ${key}: ${result.failure.message}`,
            )
          }

          return { key, encrypted: result.data }
        },
      )

      const encryptedValues = await Promise.all(encryptionPromises)

      // Manually stringify encrypted values to composite type format
      for (const { key, encrypted } of encryptedValues) {
        const jsonStr = JSON.stringify(encrypted)
        const escaped = jsonStr.replace(/\"/g, '""')
        const compositeValue = `("${escaped}")`
        instance.setDataValue(key, compositeValue)
      }
    }
  })

  /**
   * afterBulkCreate: Decrypt values after bulk INSERT with returning
   */
  model.addHook('afterBulkCreate', async (instances: M[]) => {
    if (instances.length === 0) return

    const attributes = model.getAttributes()

    // Parse composite type strings to encrypted objects
    const parsedModels = instances.map((instance) => {
      const plainData = instance.get({ plain: true })
      const parsed: Record<string, any> = { ...plainData }

      for (const [key, attribute] of Object.entries(attributes)) {
        const columnConfig = getEncryptedColumnConfig(attribute.type, key)
        if (columnConfig && plainData[key]) {
          // Parse composite type format ("json_string") back to object
          const value = plainData[key]
          if (
            typeof value === 'string' &&
            value.startsWith('("') &&
            value.endsWith('")')
          ) {
            const inner = value.slice(2, -2) // Remove (" and ")
            const unescaped = inner.replace(/""/g, '"') // Unescape quotes
            parsed[key] = JSON.parse(unescaped)
          }
        }
      }
      return parsed
    })

    // Bulk decrypt all models
    const decrypted = await protectClient.bulkDecryptModels(parsedModels)

    if (decrypted.failure) {
      throw new Error(`Decryption failed: ${decrypted.failure.message}`)
    }

    // Update model instances with decrypted values
    for (let i = 0; i < instances.length; i++) {
      instances[i].set(decrypted.data[i], { raw: true })
    }
  })

  /**
   * beforeSave: Encrypt values before INSERT or UPDATE
   * This hook fires for both create and update operations
   */
  model.addHook('beforeSave', async (instance: M) => {
    const plainData = instance.get({ plain: true })
    const attributes = model.getAttributes()

    // Collect encrypted column values
    const encryptedColumns: Array<{
      key: string
      value: any
      column: any
    }> = []

    for (const [key, attribute] of Object.entries(attributes)) {
      const columnConfig = getEncryptedColumnConfig(attribute.type, key)
      if (
        columnConfig &&
        plainData[key] !== undefined &&
        plainData[key] !== null
      ) {
        encryptedColumns.push({
          key,
          value: plainData[key],
          column: (protectTable as any)[key],
        })
      }
    }

    if (encryptedColumns.length === 0) return

    // Encrypt each column value
    const encryptionPromises = encryptedColumns.map(
      async ({ key, value, column }) => {
        const result = await protectClient.encrypt(value, {
          column,
          table: protectTable,
        })

        if (result.failure) {
          throw new Error(
            `Encryption failed for ${key}: ${result.failure.message}`,
          )
        }

        return { key, encrypted: result.data }
      },
    )

    const encryptedValues = await Promise.all(encryptionPromises)

    // Manually stringify encrypted values to composite type format
    // Format: ("json_with_escaped_quotes")
    for (const { key, encrypted } of encryptedValues) {
      const jsonStr = JSON.stringify(encrypted)
      const escaped = jsonStr.replace(/"/g, '""')
      const compositeValue = `("${escaped}")`
      instance.setDataValue(key, compositeValue)
    }
  })
}
