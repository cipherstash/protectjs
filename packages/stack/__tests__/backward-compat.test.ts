import 'dotenv/config'
import { encryptedColumn, encryptedTable } from '@cipherstash/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { Encryption } from '../src'

const users = encryptedTable('users', {
  email: encryptedColumn('email'),
})

describe('k-field backward compatibility', () => {
  let protectClient: Awaited<ReturnType<typeof protect>>

  beforeAll(async () => {
    protectClient = await Encryption({ schemas: [users] })
  })

  it('should encrypt new data WITHOUT k field (forward compatibility)', async () => {
    const testData = 'test@example.com'

    const result = await protectClient.encrypt(testData, {
      column: users.email,
      table: users,
    })

    if (result.failure) {
      throw new Error(`Encryption failed: ${result.failure.message}`)
    }

    // Forward compatibility: new encryptions should NOT have k field
    expect(result.data).not.toHaveProperty('k')
    expect(result.data).toHaveProperty('c')
    expect(result.data).toHaveProperty('v')
    expect(result.data).toHaveProperty('i')
  }, 30000)

  it('should decrypt data with legacy k field (backward compatibility)', async () => {
    // First encrypt some data
    const testData = 'legacy@example.com'

    const encrypted = await protectClient.encrypt(testData, {
      column: users.email,
      table: users,
    })

    if (encrypted.failure) {
      throw new Error(`Encryption failed: ${encrypted.failure.message}`)
    }

    // Simulate legacy payload by adding k field to the encrypted data
    // Use non-null assertion since we've already checked for failure above
    const legacyPayload = {
      ...encrypted.data!,
      k: 'ct', // Legacy discriminant field - should be ignored during decryption
    }

    // Decrypt should succeed even with legacy k field present
    const result = await protectClient.decrypt(legacyPayload)

    if (result.failure) {
      throw new Error(`Decryption failed: ${result.failure.message}`)
    }

    expect(result.data).toBe(testData)
  }, 30000)
})
