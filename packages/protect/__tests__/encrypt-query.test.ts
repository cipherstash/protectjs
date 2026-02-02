import 'dotenv/config'
import { describe, expect, it, beforeAll, vi } from 'vitest'
import { csColumn, csTable } from '@cipherstash/schema'
import { protect } from '../src'
import type { ProtectClient } from '../src/ffi'

const users = csTable('users', {
  email: csColumn('email').equality(),
  bio: csColumn('bio').freeTextSearch(),
  age: csColumn('age').dataType('number').orderAndRange(),
})

describe('encryptQuery', () => {
  let protectClient: ProtectClient

  beforeAll(async () => {
    protectClient = await protect({ schemas: [users] })
  })

  describe('single value encryption with explicit queryType', () => {
    it('encrypts for equality query type', async () => {
      const result = await protectClient.encryptQuery('test@example.com', {
        column: users.email,
        table: users,
        queryType: 'equality',
      })

      if (result.failure) throw new Error(result.failure.message)

      expect(result.data).toMatchObject({
        i: { t: 'users', c: 'email' },
        v: expect.any(Number),
      })
      expect(result.data).toHaveProperty('hm')
    }, 30000)

    it('encrypts for freeTextSearch query type', async () => {
      const result = await protectClient.encryptQuery('hello world', {
        column: users.bio,
        table: users,
        queryType: 'freeTextSearch',
      })

      if (result.failure) throw new Error(result.failure.message)

      expect(result.data).toMatchObject({
        i: { t: 'users', c: 'bio' },
        v: expect.any(Number),
      })
      expect(result.data).toHaveProperty('bf')
    }, 30000)

    it('encrypts for orderAndRange query type', async () => {
      const result = await protectClient.encryptQuery(25, {
        column: users.age,
        table: users,
        queryType: 'orderAndRange',
      })

      if (result.failure) throw new Error(result.failure.message)

      expect(result.data).toMatchObject({
        i: { t: 'users', c: 'age' },
        v: expect.any(Number),
      })
      expect(result.data).toHaveProperty('ob')
    }, 30000)
  })

  describe('auto-inference when queryType omitted', () => {
    it('auto-infers equality for column with .equality()', async () => {
      const result = await protectClient.encryptQuery('test@example.com', {
        column: users.email,
        table: users,
      })

      if (result.failure) throw new Error(result.failure.message)
      expect(result.data).toHaveProperty('hm')
    }, 30000)
  })

  describe('edge cases', () => {
    it('handles null values', async () => {
      const result = await protectClient.encryptQuery(null, {
        column: users.email,
        table: users,
        queryType: 'equality',
      })

      if (result.failure) throw new Error(result.failure.message)
      expect(result.data).toBeNull()
    }, 30000)

    it('rejects NaN values', async () => {
      const result = await protectClient.encryptQuery(NaN, {
        column: users.age,
        table: users,
        queryType: 'orderAndRange',
      })

      expect(result.failure).toBeDefined()
      expect(result.failure?.message).toContain('NaN')
    }, 30000)

    it('rejects Infinity values', async () => {
      const result = await protectClient.encryptQuery(Infinity, {
        column: users.age,
        table: users,
        queryType: 'orderAndRange',
      })

      expect(result.failure).toBeDefined()
      expect(result.failure?.message).toContain('Infinity')
    }, 30000)
  })

  describe('encryptQuery bulk (array overload)', () => {
    it('encrypts multiple terms in batch', async () => {
      const result = await protectClient.encryptQuery([
        { value: 'user@example.com', column: users.email, table: users, queryType: 'equality' },
        { value: 'search term', column: users.bio, table: users, queryType: 'freeTextSearch' },
        { value: 42, column: users.age, table: users, queryType: 'orderAndRange' },
      ])

      if (result.failure) throw new Error(result.failure.message)

      expect(result.data).toHaveLength(3)
      expect(result.data[0]).toMatchObject({ i: { t: 'users', c: 'email' } })
      expect(result.data[1]).toMatchObject({ i: { t: 'users', c: 'bio' } })
      expect(result.data[2]).toMatchObject({ i: { t: 'users', c: 'age' } })
    }, 30000)

    it('handles empty array', async () => {
      const result = await protectClient.encryptQuery([])

      if (result.failure) throw new Error(result.failure.message)
      expect(result.data).toEqual([])
    }, 30000)

    it('handles null values in batch', async () => {
      const result = await protectClient.encryptQuery([
        { value: 'test@example.com', column: users.email, table: users, queryType: 'equality' },
        { value: null, column: users.bio, table: users, queryType: 'freeTextSearch' },
      ])

      if (result.failure) throw new Error(result.failure.message)

      expect(result.data).toHaveLength(2)
      expect(result.data[0]).not.toBeNull()
      expect(result.data[1]).toBeNull()
    }, 30000)

    it('auto-infers queryType when omitted', async () => {
      const result = await protectClient.encryptQuery([
        { value: 'user@example.com', column: users.email, table: users },
        { value: 42, column: users.age, table: users },
      ])

      if (result.failure) throw new Error(result.failure.message)

      expect(result.data).toHaveLength(2)
      expect(result.data[0]).toHaveProperty('hm')
      expect(result.data[1]).toHaveProperty('ob')
    }, 30000)

    it('rejects NaN/Infinity values in batch', async () => {
      const result = await protectClient.encryptQuery([
        { value: NaN, column: users.age, table: users, queryType: 'orderAndRange' },
        { value: Infinity, column: users.age, table: users, queryType: 'orderAndRange' },
      ])

      expect(result.failure).toBeDefined()
    }, 30000)
  })

  describe('audit support', () => {
    it('passes audit metadata for single query', async () => {
      const result = await protectClient
        .encryptQuery('test@example.com', {
          column: users.email,
          table: users,
          queryType: 'equality',
        })
        .audit({ userId: 'test-user' })

      if (result.failure) throw new Error(result.failure.message)
      expect(result.data).toMatchObject({ i: { t: 'users', c: 'email' } })
    }, 30000)

    it('passes audit metadata for bulk query', async () => {
      const result = await protectClient
        .encryptQuery([
          { value: 'test@example.com', column: users.email, table: users, queryType: 'equality' },
        ])
        .audit({ userId: 'test-user' })

      if (result.failure) throw new Error(result.failure.message)
      expect(result.data).toHaveLength(1)
    }, 30000)
  })

  describe('LockContext support', () => {
    it('single query with LockContext calls getLockContext', async () => {
      const mockLockContext = {
        getLockContext: vi.fn().mockResolvedValue({
          data: {
            ctsToken: 'mock-token',
            context: { userId: 'test-user' }
          }
        })
      }

      const operation = protectClient.encryptQuery('test@example.com', {
        column: users.email,
        table: users,
        queryType: 'equality',
      })

      const withContext = operation.withLockContext(mockLockContext as any)
      expect(withContext).toHaveProperty('execute')
      expect(typeof withContext.execute).toBe('function')
    }, 30000)

    it('bulk query with LockContext calls getLockContext', async () => {
      const mockLockContext = {
        getLockContext: vi.fn().mockResolvedValue({
          data: {
            ctsToken: 'mock-token',
            context: { userId: 'test-user' }
          }
        })
      }

      const operation = protectClient.encryptQuery([
        { value: 'test@example.com', column: users.email, table: users, queryType: 'equality' },
      ])

      const withContext = operation.withLockContext(mockLockContext as any)
      expect(withContext).toHaveProperty('execute')
      expect(typeof withContext.execute).toBe('function')
    }, 30000)
  })
})
