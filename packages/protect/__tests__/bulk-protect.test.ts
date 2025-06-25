import 'dotenv/config'
import { describe, expect, it, beforeAll } from 'vitest'

import {
  LockContext,
  protect,
  csTable,
  csColumn,
  type EncryptedPayload,
} from '../src'

const users = csTable('users', {
  email: csColumn('email').freeTextSearch().equality().orderAndRange(),
  address: csColumn('address').freeTextSearch(),
})

type User = {
  id: string
  email?: string | null
  createdAt?: Date
  updatedAt?: Date
  address?: string | null
  number?: number
}

let protectClient: Awaited<ReturnType<typeof protect>>

beforeAll(async () => {
  protectClient = await protect({
    schemas: [users],
  })
})

describe('bulk encryption and decryption', () => {
  describe('bulk encrypt', () => {
    it('should bulk encrypt an array of plaintexts with IDs', async () => {
      const plaintexts = [
        { id: 'user1', plaintext: 'alice@example.com' },
        { id: 'user2', plaintext: 'bob@example.com' },
        { id: 'user3', plaintext: 'charlie@example.com' },
      ]

      const encryptedData = await protectClient.bulkEncrypt(plaintexts, {
        column: users.email,
        table: users,
      })

      if (encryptedData.failure) {
        throw new Error(`[protect]: ${encryptedData.failure.message}`)
      }

      // Verify structure
      expect(encryptedData.data).toHaveLength(3)
      expect(encryptedData.data[0]).toHaveProperty('id', 'user1')
      expect(encryptedData.data[0]).toHaveProperty('data')
      expect(encryptedData.data[0].data).toHaveProperty('c')
      expect(encryptedData.data[1]).toHaveProperty('id', 'user2')
      expect(encryptedData.data[1]).toHaveProperty('data')
      expect(encryptedData.data[2]).toHaveProperty('id', 'user3')
      expect(encryptedData.data[2]).toHaveProperty('data')

      // Verify all encrypted values are different
      expect(encryptedData.data[0].data?.c).not.toBe(
        encryptedData.data[1].data?.c,
      )
      expect(encryptedData.data[1].data?.c).not.toBe(
        encryptedData.data[2].data?.c,
      )
      expect(encryptedData.data[0].data?.c).not.toBe(
        encryptedData.data[2].data?.c,
      )
    }, 30000)

    it('should bulk encrypt an array of plaintexts without IDs', async () => {
      const plaintexts = [
        { plaintext: 'alice@example.com' },
        { plaintext: 'bob@example.com' },
        { plaintext: 'charlie@example.com' },
      ]

      const encryptedData = await protectClient.bulkEncrypt(plaintexts, {
        column: users.email,
        table: users,
      })

      if (encryptedData.failure) {
        throw new Error(`[protect]: ${encryptedData.failure.message}`)
      }

      // Verify structure
      expect(encryptedData.data).toHaveLength(3)
      expect(encryptedData.data[0]).toHaveProperty('id', undefined)
      expect(encryptedData.data[0]).toHaveProperty('data')
      expect(encryptedData.data[0].data).toHaveProperty('c')
      expect(encryptedData.data[1]).toHaveProperty('id', undefined)
      expect(encryptedData.data[1]).toHaveProperty('data')
      expect(encryptedData.data[1].data).toHaveProperty('c')
      expect(encryptedData.data[2]).toHaveProperty('id', undefined)
      expect(encryptedData.data[2]).toHaveProperty('data')
      expect(encryptedData.data[2].data).toHaveProperty('c')
    }, 30000)

    it('should handle null values in bulk encrypt', async () => {
      const plaintexts = [
        { id: 'user1', plaintext: 'alice@example.com' },
        { id: 'user2', plaintext: null },
        { id: 'user3', plaintext: 'charlie@example.com' },
      ]

      const encryptedData = await protectClient.bulkEncrypt(plaintexts, {
        column: users.email,
        table: users,
      })

      if (encryptedData.failure) {
        throw new Error(`[protect]: ${encryptedData.failure.message}`)
      }

      // Verify structure
      expect(encryptedData.data).toHaveLength(3)
      expect(encryptedData.data[0]).toHaveProperty('id', 'user1')
      expect(encryptedData.data[0]).toHaveProperty('data')
      expect(encryptedData.data[0].data).toHaveProperty('c')
      expect(encryptedData.data[1]).toHaveProperty('id', 'user2')
      expect(encryptedData.data[1]).toHaveProperty('data')
      expect(encryptedData.data[1].data).toBeNull()
      expect(encryptedData.data[2]).toHaveProperty('id', 'user3')
      expect(encryptedData.data[2]).toHaveProperty('data')
      expect(encryptedData.data[2].data).toHaveProperty('c')
    }, 30000)

    it('should handle all null values in bulk encrypt', async () => {
      const plaintexts = [
        { id: 'user1', plaintext: null },
        { id: 'user2', plaintext: null },
        { id: 'user3', plaintext: null },
      ]

      const encryptedData = await protectClient.bulkEncrypt(plaintexts, {
        column: users.email,
        table: users,
      })

      if (encryptedData.failure) {
        throw new Error(`[protect]: ${encryptedData.failure.message}`)
      }

      // Verify structure
      expect(encryptedData.data).toHaveLength(3)
      expect(encryptedData.data[0]).toHaveProperty('id', 'user1')
      expect(encryptedData.data[0]).toHaveProperty('data')
      expect(encryptedData.data[0].data).toBeNull()
      expect(encryptedData.data[1]).toHaveProperty('id', 'user2')
      expect(encryptedData.data[1]).toHaveProperty('data')
      expect(encryptedData.data[1].data).toBeNull()
      expect(encryptedData.data[2]).toHaveProperty('id', 'user3')
      expect(encryptedData.data[2]).toHaveProperty('data')
      expect(encryptedData.data[2].data).toBeNull()
    }, 30000)

    it('should handle empty array in bulk encrypt', async () => {
      const plaintexts: Array<{ id?: string; plaintext: string | null }> = []

      const encryptedData = await protectClient.bulkEncrypt(plaintexts, {
        column: users.email,
        table: users,
      })

      if (encryptedData.failure) {
        throw new Error(`[protect]: ${encryptedData.failure.message}`)
      }

      expect(encryptedData.data).toHaveLength(0)
    }, 30000)
  })

  describe('bulk decrypt', () => {
    it('should bulk decrypt an array of encrypted payloads with IDs', async () => {
      // First encrypt some data
      const plaintexts = [
        { id: 'user1', plaintext: 'alice@example.com' },
        { id: 'user2', plaintext: 'bob@example.com' },
        { id: 'user3', plaintext: 'charlie@example.com' },
      ]

      const encryptedData = await protectClient.bulkEncrypt(plaintexts, {
        column: users.email,
        table: users,
      })

      if (encryptedData.failure) {
        throw new Error(`[protect]: ${encryptedData.failure.message}`)
      }

      // Now decrypt the data
      const decryptedData = await protectClient.bulkDecrypt(encryptedData.data)

      if (decryptedData.failure) {
        throw new Error(`[protect]: ${decryptedData.failure.message}`)
      }

      // Verify structure
      expect(decryptedData.data).toHaveLength(3)
      expect(decryptedData.data[0]).toHaveProperty('id', 'user1')
      expect(decryptedData.data[0]).toHaveProperty('data', 'alice@example.com')
      expect(decryptedData.data[1]).toHaveProperty('id', 'user2')
      expect(decryptedData.data[1]).toHaveProperty('data', 'bob@example.com')
      expect(decryptedData.data[2]).toHaveProperty('id', 'user3')
      expect(decryptedData.data[2]).toHaveProperty(
        'data',
        'charlie@example.com',
      )
    }, 30000)

    it('should bulk decrypt an array of encrypted payloads without IDs', async () => {
      // First encrypt some data
      const plaintexts = [
        { plaintext: 'alice@example.com' },
        { plaintext: 'bob@example.com' },
        { plaintext: 'charlie@example.com' },
      ]

      const encryptedData = await protectClient.bulkEncrypt(plaintexts, {
        column: users.email,
        table: users,
      })

      if (encryptedData.failure) {
        throw new Error(`[protect]: ${encryptedData.failure.message}`)
      }

      // Now decrypt the data
      const decryptedData = await protectClient.bulkDecrypt(encryptedData.data)

      if (decryptedData.failure) {
        throw new Error(`[protect]: ${decryptedData.failure.message}`)
      }

      // Verify structure
      expect(decryptedData.data).toHaveLength(3)
      expect(decryptedData.data[0]).toHaveProperty('id', undefined)
      expect(decryptedData.data[0]).toHaveProperty('data', 'alice@example.com')
      expect(decryptedData.data[1]).toHaveProperty('id', undefined)
      expect(decryptedData.data[1]).toHaveProperty('data', 'bob@example.com')
      expect(decryptedData.data[2]).toHaveProperty('id', undefined)
      expect(decryptedData.data[2]).toHaveProperty(
        'data',
        'charlie@example.com',
      )
    }, 30000)

    it('should handle null values in bulk decrypt', async () => {
      // First encrypt some data with nulls
      const plaintexts = [
        { id: 'user1', plaintext: 'alice@example.com' },
        { id: 'user2', plaintext: null },
        { id: 'user3', plaintext: 'charlie@example.com' },
      ]

      const encryptedData = await protectClient.bulkEncrypt(plaintexts, {
        column: users.email,
        table: users,
      })

      if (encryptedData.failure) {
        throw new Error(`[protect]: ${encryptedData.failure.message}`)
      }

      // Now decrypt the data
      const decryptedData = await protectClient.bulkDecrypt(encryptedData.data)

      if (decryptedData.failure) {
        throw new Error(`[protect]: ${decryptedData.failure.message}`)
      }

      // Verify structure
      expect(decryptedData.data).toHaveLength(3)
      expect(decryptedData.data[0]).toHaveProperty('id', 'user1')
      expect(decryptedData.data[0]).toHaveProperty('data', 'alice@example.com')
      expect(decryptedData.data[1]).toHaveProperty('id', 'user2')
      expect(decryptedData.data[1]).toHaveProperty('data', null)
      expect(decryptedData.data[2]).toHaveProperty('id', 'user3')
      expect(decryptedData.data[2]).toHaveProperty(
        'data',
        'charlie@example.com',
      )
    }, 30000)

    it('should handle all null values in bulk decrypt', async () => {
      // First encrypt some data with all nulls
      const plaintexts = [
        { id: 'user1', plaintext: null },
        { id: 'user2', plaintext: null },
        { id: 'user3', plaintext: null },
      ]

      const encryptedData = await protectClient.bulkEncrypt(plaintexts, {
        column: users.email,
        table: users,
      })

      if (encryptedData.failure) {
        throw new Error(`[protect]: ${encryptedData.failure.message}`)
      }

      // Now decrypt the data
      const decryptedData = await protectClient.bulkDecrypt(encryptedData.data)

      if (decryptedData.failure) {
        throw new Error(`[protect]: ${decryptedData.failure.message}`)
      }

      // Verify structure
      expect(decryptedData.data).toHaveLength(3)
      expect(decryptedData.data[0]).toHaveProperty('id', 'user1')
      expect(decryptedData.data[0]).toHaveProperty('data', null)
      expect(decryptedData.data[1]).toHaveProperty('id', 'user2')
      expect(decryptedData.data[1]).toHaveProperty('data', null)
      expect(decryptedData.data[2]).toHaveProperty('id', 'user3')
      expect(decryptedData.data[2]).toHaveProperty('data', null)
    }, 30000)

    it('should handle empty array in bulk decrypt', async () => {
      const encryptedPayloads: Array<{ id?: string; data: EncryptedPayload }> =
        []

      const decryptedData = await protectClient.bulkDecrypt(encryptedPayloads)

      if (decryptedData.failure) {
        throw new Error(`[protect]: ${decryptedData.failure.message}`)
      }

      expect(decryptedData.data).toHaveLength(0)
    }, 30000)
  })

  describe('bulk operations with lock context', () => {
    it('should bulk encrypt and decrypt with lock context', async () => {
      // This test requires a valid JWT token, so we'll skip it in CI
      // TODO: Add proper JWT token handling for CI
      const userJwt = process.env.USER_JWT

      if (!userJwt) {
        console.log('Skipping lock context test - no USER_JWT provided')
        return
      }

      const lc = new LockContext()
      const lockContext = await lc.identify(userJwt)

      if (lockContext.failure) {
        throw new Error(`[protect]: ${lockContext.failure.message}`)
      }

      const plaintexts = [
        { id: 'user1', plaintext: 'alice@example.com' },
        { id: 'user2', plaintext: 'bob@example.com' },
        { id: 'user3', plaintext: 'charlie@example.com' },
      ]

      // Encrypt with lock context
      const encryptedData = await protectClient
        .bulkEncrypt(plaintexts, {
          column: users.email,
          table: users,
        })
        .withLockContext(lockContext.data)

      if (encryptedData.failure) {
        throw new Error(`[protect]: ${encryptedData.failure.message}`)
      }

      // Verify structure
      expect(encryptedData.data).toHaveLength(3)
      expect(encryptedData.data[0]).toHaveProperty('id', 'user1')
      expect(encryptedData.data[0]).toHaveProperty('data')
      expect(encryptedData.data[0].data).toHaveProperty('c')
      expect(encryptedData.data[1]).toHaveProperty('id', 'user2')
      expect(encryptedData.data[1]).toHaveProperty('data')
      expect(encryptedData.data[1].data).toHaveProperty('c')
      expect(encryptedData.data[2]).toHaveProperty('id', 'user3')
      expect(encryptedData.data[2]).toHaveProperty('data')
      expect(encryptedData.data[2].data).toHaveProperty('c')

      // Decrypt with lock context
      const decryptedData = await protectClient
        .bulkDecrypt(encryptedData.data)
        .withLockContext(lockContext.data)

      if (decryptedData.failure) {
        throw new Error(`[protect]: ${decryptedData.failure.message}`)
      }

      // Verify decrypted data
      expect(decryptedData.data).toHaveLength(3)
      expect(decryptedData.data[0]).toHaveProperty('id', 'user1')
      expect(decryptedData.data[0]).toHaveProperty('data', 'alice@example.com')
      expect(decryptedData.data[1]).toHaveProperty('id', 'user2')
      expect(decryptedData.data[1]).toHaveProperty('data', 'bob@example.com')
      expect(decryptedData.data[2]).toHaveProperty('id', 'user3')
      expect(decryptedData.data[2]).toHaveProperty(
        'data',
        'charlie@example.com',
      )
    }, 30000)

    it('should handle null values with lock context', async () => {
      const userJwt = process.env.USER_JWT

      if (!userJwt) {
        console.log('Skipping lock context test - no USER_JWT provided')
        return
      }

      const lc = new LockContext()
      const lockContext = await lc.identify(userJwt)

      if (lockContext.failure) {
        throw new Error(`[protect]: ${lockContext.failure.message}`)
      }

      const plaintexts = [
        { id: 'user1', plaintext: 'alice@example.com' },
        { id: 'user2', plaintext: null },
        { id: 'user3', plaintext: 'charlie@example.com' },
      ]

      // Encrypt with lock context
      const encryptedData = await protectClient
        .bulkEncrypt(plaintexts, {
          column: users.email,
          table: users,
        })
        .withLockContext(lockContext.data)

      if (encryptedData.failure) {
        throw new Error(`[protect]: ${encryptedData.failure.message}`)
      }

      // Verify null is preserved
      expect(encryptedData.data[1]).toHaveProperty('data')
      expect(encryptedData.data[1].data).toBeNull()

      // Decrypt with lock context
      const decryptedData = await protectClient
        .bulkDecrypt(encryptedData.data)
        .withLockContext(lockContext.data)

      if (decryptedData.failure) {
        throw new Error(`[protect]: ${decryptedData.failure.message}`)
      }

      // Verify null is preserved
      expect(decryptedData.data[1]).toHaveProperty('data')
      expect(decryptedData.data[1].data).toBeNull()
    }, 30000)
  })

  describe('bulk operations round-trip', () => {
    it('should maintain data integrity through encrypt/decrypt cycle', async () => {
      const originalData = [
        { id: 'user1', plaintext: 'alice@example.com' },
        { id: 'user2', plaintext: 'bob@example.com' },
        { id: 'user3', plaintext: null },
        { id: 'user4', plaintext: 'dave@example.com' },
      ]

      // Encrypt
      const encryptedData = await protectClient.bulkEncrypt(originalData, {
        column: users.email,
        table: users,
      })

      if (encryptedData.failure) {
        throw new Error(`[protect]: ${encryptedData.failure.message}`)
      }

      // Decrypt
      const decryptedData = await protectClient.bulkDecrypt(encryptedData.data)

      if (decryptedData.failure) {
        throw new Error(`[protect]: ${decryptedData.failure.message}`)
      }

      // Verify round-trip integrity
      expect(decryptedData.data).toHaveLength(originalData.length)

      for (let i = 0; i < originalData.length; i++) {
        expect(decryptedData.data[i].id).toBe(originalData[i].id)
        expect(decryptedData.data[i].data).toBe(originalData[i].plaintext)
      }
    }, 30000)

    it('should handle large arrays efficiently', async () => {
      const originalData = Array.from({ length: 100 }, (_, i) => ({
        id: `user${i}`,
        plaintext: `user${i}@example.com`,
      }))

      // Encrypt
      const encryptedData = await protectClient.bulkEncrypt(originalData, {
        column: users.email,
        table: users,
      })

      if (encryptedData.failure) {
        throw new Error(`[protect]: ${encryptedData.failure.message}`)
      }

      // Decrypt
      const decryptedData = await protectClient.bulkDecrypt(encryptedData.data)

      if (decryptedData.failure) {
        throw new Error(`[protect]: ${decryptedData.failure.message}`)
      }

      // Verify all data is preserved
      expect(decryptedData.data).toHaveLength(100)

      for (let i = 0; i < 100; i++) {
        expect(decryptedData.data[i].id).toBe(`user${i}`)
        expect(decryptedData.data[i].data).toBe(`user${i}@example.com`)
      }
    }, 30000)
  })
})
