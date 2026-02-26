import 'dotenv/config'
import { Encryption } from '@/index'
import { defineContract, encrypted } from '@/contract'
import { describe, expect, it } from 'vitest'

const contract = defineContract({
  users: {
    email: encrypted({ type: 'string' }),
  },
})

describe('encryption and decryption with keyset id', () => {
  it('should encrypt and decrypt a payload', async () => {
    const protectClient = await Encryption({
      contract,
      config: {
        keyset: {
          id: '4152449b-505a-4186-93b6-d3d87eba7a47',
        },
      },
    })

    const email = 'hello@example.com'

    const ciphertext = await protectClient.encrypt(email, {
      contract: contract.users.email,
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
      contract,
      config: {
        keyset: {
          name: 'Test',
        },
      },
    })

    const email = 'hello@example.com'

    const ciphertext = await protectClient.encrypt(email, {
      contract: contract.users.email,
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
        contract,
        config: {
          keyset: {
            id: 'invalid-uuid',
          },
        },
      }),
    ).rejects.toThrow(
      '[encryption]: Invalid UUID provided for keyset id. Must be a valid UUID.',
    )
  })
})
