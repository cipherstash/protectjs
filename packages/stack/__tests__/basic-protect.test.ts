import 'dotenv/config'
import { Encryption, defineContract } from '@/index'
import { encrypted } from '@/contract'
import { beforeAll, describe, expect, it } from 'vitest'

const contract = defineContract({
  users: {
    email: encrypted({
      type: 'string',
      equality: true,
      freeTextSearch: true,
      orderAndRange: true,
    }),
    address: encrypted({ type: 'string', freeTextSearch: true }),
    json: encrypted({ type: 'json' }),
  },
})

let protectClient: Awaited<ReturnType<typeof Encryption>>

beforeAll(async () => {
  protectClient = await Encryption({
    contract,
  })
})

describe('encryption and decryption', () => {
  it('should encrypt and decrypt a payload', async () => {
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
