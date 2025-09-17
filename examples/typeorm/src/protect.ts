import { protect, csTable, csColumn } from '@cipherstash/protect'

/**
 * Define the protected schema for the User entity
 * This maps to the encrypted fields in your TypeORM entity
 */
export const protectedUser = csTable('user', {
  email: csColumn('email').equality().orderAndRange(),
  ssn: csColumn('ssn').equality(),
  phone: csColumn('phone').equality(),
})

/**
 * Initialize the Protect client with the defined schema
 * This will be used throughout the application for encryption/decryption operations
 */
let protectClient: Awaited<ReturnType<typeof protect>>

export async function initializeProtectClient() {
  if (!protectClient) {
    protectClient = await protect({
      schemas: [protectedUser],
    })
  }
  return protectClient
}
