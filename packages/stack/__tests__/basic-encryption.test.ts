import 'dotenv/config'
import { encryptedColumn, encryptedTable } from '@cipherstash/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { Encryption, type EncryptionClient } from '../src'

const users = encryptedTable('users', {
  email: encryptedColumn('email').freeTextSearch().equality().orderAndRange(),
  address: encryptedColumn('address').freeTextSearch(),
  json: encryptedColumn('json').dataType('json'),
})

let encryptionClient: EncryptionClient

beforeAll(async () => {
  encryptionClient = await Encryption({
    schemas: [users],
  })
})

describe('encryption and decryption', () => {
  it('should encrypt and decrypt a payload', async () => {
    const email = 'hello@example.com'

    const ciphertext = await encryptionClient.encrypt(email, {
      column: users.email,
      table: users,
    })

    if (ciphertext.failure) {
      throw new Error(`[encryption]: ${ciphertext.failure.message}`)
    }

    // Verify encrypted field
    expect(ciphertext.data).toHaveProperty('c')

    const a = ciphertext.data

    const plaintext = await encryptionClient.decrypt(ciphertext.data)

    expect(plaintext).toEqual({
      data: email,
    })
  }, 30000)
})
