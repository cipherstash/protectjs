import 'dotenv/config'
import { describe, expect, it, beforeAll } from 'vitest'
import { csTable, csColumn } from '@cipherstash/schema'
import { LockContext, protect } from '../src'

const users = csTable('users', {
  auditable: csColumn('auditable'),
})

type User = {
  id: string
  auditable?: string | null
}

let protectClient: Awaited<ReturnType<typeof protect>>

beforeAll(async () => {
  protectClient = await protect({
    schemas: [users],
  })
})

describe('encryption and decryption', () => {
  it('should encrypt and decrypt a payload with audit metadata', async () => {
    const email = 'very_secret_data'

    const ciphertext = await protectClient
      .encrypt(email, {
        column: users.auditable,
        table: users,
      })
      .audit({
        metadata: {
          sub: 'cj@cjb.io',
          hello: 'world',
          foo: 'bar',
        },
      })

    if (ciphertext.failure) {
      throw new Error(`[protect]: ${ciphertext.failure.message}`)
    }

    // Verify encrypted field
    expect(ciphertext.data).toHaveProperty('c')

    const plaintext = await protectClient.decrypt(ciphertext.data).audit({
      metadata: {
        sub: 'cj@cjb.io',
        hello: 'world',
        foo: 'bar',
      },
    })

    expect(plaintext).toEqual({
      data: email,
    })
  }, 30000)
})
