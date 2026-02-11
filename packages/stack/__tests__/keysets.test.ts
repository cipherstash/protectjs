import 'dotenv/config'
import { encryptedColumn, encryptedTable } from '@cipherstash/schema'
import { describe, expect, it } from 'vitest'
import { Encryption } from '../src'

const users = encryptedTable('users', {
  email: encryptedColumn('email'),
})

describe('encryption and decryption with keyset id', () => {
  it('should encrypt and decrypt a payload', async () => {
    const protectClient = await Encryption({
      schemas: [users],
      keyset: {
        id: '4152449b-505a-4186-93b6-d3d87eba7a47',
      },
    })

    const email = 'hello@example.com'

    const ciphertext = await protectClient.encrypt(email, {
      column: users.email,
      table: users,
    })

    if (ciphertext.failure) {
      throw new Error(`[protect]: ${ciphertext.failure.message}`)
    }

    // Verify encrypted field
    expect(ciphertext.data).toHaveProperty('c')

    const a = ciphertext.data

    const plaintext = await protectClient.decrypt(ciphertext.data)

    expect(plaintext).toEqual({
      data: email,
    })
  }, 30000)
})

describe('encryption and decryption with keyset name', () => {
  it('should encrypt and decrypt a payload', async () => {
    const protectClient = await Encryption({
      schemas: [users],
      keyset: {
        name: 'Test',
      },
    })

    const email = 'hello@example.com'

    const ciphertext = await protectClient.encrypt(email, {
      column: users.email,
      table: users,
    })

    if (ciphertext.failure) {
      throw new Error(`[protect]: ${ciphertext.failure.message}`)
    }

    // Verify encrypted field
    expect(ciphertext.data).toHaveProperty('c')

    const a = ciphertext.data

    const plaintext = await protectClient.decrypt(ciphertext.data)

    expect(plaintext).toEqual({
      data: email,
    })
  }, 30000)
})

describe('encryption and decryption with invalid keyset id', () => {
  it('should throw an error', async () => {
    await expect(
      Encryption({
        schemas: [users],
        keyset: {
          id: 'invalid-uuid',
        },
      }),
    ).rejects.toThrow(
      '[encryption]: Invalid UUID provided for keyset id. Must be a valid UUID.',
    )
  })
})
