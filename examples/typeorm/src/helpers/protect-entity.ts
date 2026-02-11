import {
  type EncryptionClientConfig,
  encryptedToPgComposite,
} from '@cipherstash/stack'
import type { EntityTarget } from 'typeorm'
import { AppDataSource } from '../data-source'

/**
 * Helper functions for working with encrypted entities in TypeORM
 */
export class ProtectEntityHelper {
  constructor(private protectClient: EncryptionClientConfig) {}

  /**
   * Bulk encrypt and save entities to the database
   *
   * @example
   * ```typescript
   * const users = [
   *   { firstName: 'John', email: 'john@example.com' },
   *   { firstName: 'Jane', email: 'jane@example.com' }
   * ]
   *
   * const savedUsers = await helper.bulkEncryptAndSave(
   *   User,
   *   users,
   *   { email: { table: protectedUser, column: protectedUser.email } }
   * )
   * ```
   */
  // biome-ignore lint/suspicious/noExplicitAny: Required for dynamic entity types
  async bulkEncryptAndSave<T extends Record<string, any>>(
    entityClass: EntityTarget<T>,
    // biome-ignore lint/suspicious/noExplicitAny: Required for dynamic entity types
    entities: Array<Record<string, any>>,
    // biome-ignore lint/suspicious/noExplicitAny: Required for Stash Encryption schema types
    encryptFields: Record<string, { table: any; column: any }>,
  ): Promise<T[]> {
    // First, prepare all entities for encryption
    const entitiesToEncrypt = entities.map((entity) => {
      const encryptedEntity = { ...entity }

      // Remove plaintext fields that will be encrypted
      for (const fieldName of Object.keys(encryptFields)) {
        delete encryptedEntity[fieldName]
      }

      return encryptedEntity
    })

    // Encrypt all fields in bulk
    // biome-ignore lint/suspicious/noExplicitAny: Required for dynamic encrypted data storage
    const encryptedFieldsData: Record<string, any[]> = {}

    for (const [fieldName, { table, column }] of Object.entries(
      encryptFields,
    )) {
      const plaintexts = entities.map((entity) => ({
        id: `${fieldName}_${entities.indexOf(entity)}`,
        plaintext: entity[fieldName] || null,
      }))

      const encryptedResult = await this.protectClient.bulkEncrypt(plaintexts, {
        table,
        column,
      })

      if (encryptedResult.failure) {
        throw new Error(
          `Failed to encrypt ${fieldName}: ${encryptedResult.failure.message}`,
        )
      }

      encryptedFieldsData[fieldName] = encryptedResult.data.map(
        (item) => item.data,
      )
    }

    // Combine encrypted data with entities
    const finalEntities = entitiesToEncrypt.map((entity, index) => ({
      ...entity,
      ...Object.fromEntries(
        Object.keys(encryptFields).map((fieldName) => [
          fieldName,
          encryptedFieldsData[fieldName][index],
        ]),
      ),
    }))

    // Save to database
    const repository = AppDataSource.getRepository(entityClass)
    // biome-ignore lint/suspicious/noExplicitAny: TypeORM save method has complex typing
    return repository.save(finalEntities as any) as Promise<T[]>
  }

  /**
   * Bulk decrypt entities loaded from the database
   *
   * @example
   * ```typescript
   * const users = await repository.find()
   * const decryptedUsers = await helper.bulkDecrypt(
   *   users,
   *   { email_encrypted: { table: protectedUser, column: protectedUser.email } }
   * )
   * ```
   */
  // biome-ignore lint/suspicious/noExplicitAny: Required for dynamic entity types
  async bulkDecrypt<T extends Record<string, any>>(
    entities: T[],
    // biome-ignore lint/suspicious/noExplicitAny: Required for Stash Encryption schema types
    decryptFields: Record<string, { table: any; column: any }>,
  ): Promise<T[]> {
    // Prepare encrypted data for bulk decryption
    // biome-ignore lint/suspicious/noExplicitAny: Required for dynamic encrypted data storage
    const encryptedData: any[] = []
    const fieldMapping: Array<{
      entityIndex: number
      fieldName: string
      dataIndex: number
    }> = []

    let dataIndex = 0

    for (const [fieldName, { table, column }] of Object.entries(
      decryptFields,
    )) {
      for (const [entityIndex, entity] of entities.entries()) {
        if (entity[fieldName]) {
          encryptedData.push({
            id: `${fieldName}_${entityIndex}`,
            data: entity[fieldName],
          })

          fieldMapping.push({
            entityIndex,
            fieldName,
            dataIndex,
          })

          dataIndex++
        }
      }
    }

    if (encryptedData.length === 0) {
      return entities
    }

    // Bulk decrypt
    const decryptedResult = await this.protectClient.bulkDecrypt(encryptedData)

    if (decryptedResult.failure) {
      throw new Error(
        `Failed to decrypt data: ${decryptedResult.failure.message}`,
      )
    }

    // Map decrypted data back to entities
    const result = entities.map((entity) => ({ ...entity }))

    for (const { entityIndex, fieldName, dataIndex } of fieldMapping) {
      const decryptedItem = decryptedResult.data[dataIndex]
      if ('data' in decryptedItem) {
        // biome-ignore lint/suspicious/noExplicitAny: Dynamic field assignment
        ;(result[entityIndex] as any)[fieldName] = decryptedItem.data
      } else if ('error' in decryptedItem) {
        console.error(
          'Failed to decrypt',
          fieldName,
          'for entity',
          entityIndex,
          ':',
          decryptedItem.error,
        )
        // biome-ignore lint/suspicious/noExplicitAny: Dynamic field assignment
        ;(result[entityIndex] as any)[fieldName] = null
      }
    }

    return result
  }

  /**
   * Create search terms for encrypted fields and find entities
   *
   * @example
   * ```typescript
   * const foundUser = await helper.searchEncryptedField(
   *   User,
   *   'email',
   *   'john@example.com',
   *   { table: protectedUser, column: protectedUser.email }
   * )
   * ```
   */
  // biome-ignore lint/suspicious/noExplicitAny: Required for dynamic entity types
  async searchEncryptedField<T extends Record<string, any>>(
    entityClass: EntityTarget<T>,
    fieldName: string,
    searchValue: string,
    // biome-ignore lint/suspicious/noExplicitAny: Required for Stash Encryption schema types
    fieldConfig: { table: any; column: any },
  ): Promise<T | null> {
    // Use encryptQuery instead of deprecated createSearchTerms
    const encryptedResult = await this.protectClient.encryptQuery([
      {
        value: searchValue,
        column: fieldConfig.column,
        table: fieldConfig.table,
        queryType: 'equality',
      },
    ])

    if (encryptedResult.failure) {
      throw new Error(
        `Failed to encrypt query: ${encryptedResult.failure.message}`,
      )
    }

    const [encrypted] = encryptedResult.data

    const repository = AppDataSource.getRepository(entityClass)
    return repository.findOne({
      where: {
        [fieldName]: encryptedToPgComposite(encrypted),
        // biome-ignore lint/suspicious/noExplicitAny: Required for dynamic field access
      } as any,
    })
  }
}
