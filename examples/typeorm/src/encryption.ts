import { Encryption, encryptedColumn, encryptedTable } from '@cipherstash/stack'

/**
 * Define the encrypted schema for the User entity
 * This maps to the encrypted fields in your TypeORM entity
 */
export const encryptedUser = encryptedTable('user', {
  email: encryptedColumn('email').equality().orderAndRange(),
  ssn: encryptedColumn('ssn').equality(),
  phone: encryptedColumn('phone').equality(),
})

/**
 * Initialize the Encryption client with the defined schema
 * This will be used throughout the application for encryption/decryption operations
 */
let encryptionClient: Awaited<ReturnType<typeof Encryption>>

export async function initializeEncryptionClient() {
  if (!encryptionClient) {
    encryptionClient = await Encryption({
      schemas: [encryptedUser],
    })
  }
  return encryptionClient
}
