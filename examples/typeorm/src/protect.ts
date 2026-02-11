import { encryptedColumn, encryptedTable, Encryption } from '@cipherstash/stack'

/**
 * Define the protected schema for the User entity
 * This maps to the encrypted fields in your TypeORM entity
 */
export const protectedUser = encryptedTable('user', {
  email: encryptedColumn('email').equality().orderAndRange(),
  ssn: encryptedColumn('ssn').equality(),
  phone: encryptedColumn('phone').equality(),
})

/**
 * Initialize the Encryption client with the defined schema
 * This will be used throughout the application for encryption/decryption operations
 */
let protectClient: Awaited<ReturnType<typeof Encryption>>

export async function initializeProtectClient() {
  if (!protectClient) {
    protectClient = await Encryption({
      schemas: [protectedUser],
    })
  }
  return protectClient
}
