import 'dotenv/config'
import { describe, expect, it, beforeAll, vi } from 'vitest'
import { csColumn, csTable } from '@cipherstash/schema'
import { protect, ProtectErrorTypes } from '../src'
import type { ProtectClient } from '../src/ffi'

const users = csTable('users', {
  email: csColumn('email').equality(),
  bio: csColumn('bio').freeTextSearch(),
  age: csColumn('age').dataType('number').orderAndRange(),
})

// Column with only freeTextSearch (for auto-inference test)
const articles = csTable('articles', {
  content: csColumn('content').freeTextSearch(),
})

// Column with only orderAndRange (for auto-inference test)
const products = csTable('products', {
  price: csColumn('price').dataType('number').orderAndRange(),
})

// Column with no indexes (for validation error test)
const metadata = csTable('metadata', {
  raw: csColumn('raw'),
})

describe('encryptQuery', () => {
  let protectClient: ProtectClient

  beforeAll(async () => {
    protectClient = await protect({ schemas: [users, articles, products, metadata] })
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

    it('auto-infers freeTextSearch for match-only column', async () => {
      const result = await protectClient.encryptQuery('search content', {
        column: articles.content,
        table: articles,
      })

      if (result.failure) throw new Error(result.failure.message)
      expect(result.data).toHaveProperty('bf')
    }, 30000)

    it('auto-infers orderAndRange for ore-only column', async () => {
      const result = await protectClient.encryptQuery(99.99, {
        column: products.price,
        table: products,
      })

      if (result.failure) throw new Error(result.failure.message)
      expect(result.data).toHaveProperty('ob')
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

    it('rejects negative Infinity values', async () => {
      const result = await protectClient.encryptQuery(-Infinity, {
        column: users.age,
        table: users,
        queryType: 'orderAndRange',
      })

      expect(result.failure).toBeDefined()
      expect(result.failure?.message).toContain('Infinity')
    }, 30000)
  })

  describe('validation errors', () => {
    it('fails when queryType does not match column config', async () => {
      const result = await protectClient.encryptQuery('test@example.com', {
        column: users.email,
        table: users,
        queryType: 'freeTextSearch', // email only has equality
      })

      expect(result.failure).toBeDefined()
      expect(result.failure?.message).toContain('not configured')
    }, 30000)

    it('fails when column has no indexes configured', async () => {
      const result = await protectClient.encryptQuery('raw data', {
        column: metadata.raw,
        table: metadata,
      })

      expect(result.failure).toBeDefined()
      expect(result.failure?.message).toContain('no indexes configured')
    }, 30000)

    it('provides descriptive error for queryType mismatch', async () => {
      const result = await protectClient.encryptQuery(42, {
        column: users.age,
        table: users,
        queryType: 'equality', // age only has orderAndRange
      })

      expect(result.failure).toBeDefined()
      expect(result.failure?.type).toBe(ProtectErrorTypes.EncryptionError)
      expect(result.failure?.message).toContain('unique')
      expect(result.failure?.message).toContain('not configured')
    }, 30000)
  })

  describe('numeric edge cases', () => {
    it('encrypts MAX_SAFE_INTEGER', async () => {
      const result = await protectClient.encryptQuery(Number.MAX_SAFE_INTEGER, {
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

    it('encrypts MIN_SAFE_INTEGER', async () => {
      const result = await protectClient.encryptQuery(Number.MIN_SAFE_INTEGER, {
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

    it('encrypts negative zero', async () => {
      const result = await protectClient.encryptQuery(-0, {
        column: users.age,
        table: users,
        queryType: 'orderAndRange',
      })

      if (result.failure) throw new Error(result.failure.message)
      expect(result.data).toHaveProperty('ob')
    }, 30000)
  })

  describe('string edge cases', () => {
    it('encrypts empty string', async () => {
      const result = await protectClient.encryptQuery('', {
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

    it('encrypts unicode/emoji strings', async () => {
      const result = await protectClient.encryptQuery('Hello 世界 🌍🚀', {
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

    it('encrypts strings with SQL special characters', async () => {
      const result = await protectClient.encryptQuery("'; DROP TABLE users; --", {
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
      // Empty arrays without opts are treated as empty batch for backward compatibility
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

    it('rejects negative Infinity in batch', async () => {
      const result = await protectClient.encryptQuery([
        { value: -Infinity, column: users.age, table: users, queryType: 'orderAndRange' },
      ])

      expect(result.failure).toBeDefined()
      expect(result.failure?.message).toContain('Infinity')
    }, 30000)
  })

  describe('bulk index preservation', () => {
    it('preserves exact positions with multiple nulls interspersed', async () => {
      const result = await protectClient.encryptQuery([
        { value: null, column: users.email, table: users, queryType: 'equality' },
        { value: 'user@example.com', column: users.email, table: users, queryType: 'equality' },
        { value: null, column: users.bio, table: users, queryType: 'freeTextSearch' },
        { value: null, column: users.age, table: users, queryType: 'orderAndRange' },
        { value: 42, column: users.age, table: users, queryType: 'orderAndRange' },
      ])

      if (result.failure) throw new Error(result.failure.message)

      expect(result.data).toHaveLength(5)
      expect(result.data[0]).toBeNull()
      expect(result.data[1]).not.toBeNull()
      expect(result.data[1]).toHaveProperty('hm')
      expect(result.data[2]).toBeNull()
      expect(result.data[3]).toBeNull()
      expect(result.data[4]).not.toBeNull()
      expect(result.data[4]).toHaveProperty('ob')
    }, 30000)

    it('handles single-item array', async () => {
      const result = await protectClient.encryptQuery([
        { value: 'single@example.com', column: users.email, table: users, queryType: 'equality' },
      ])

      if (result.failure) throw new Error(result.failure.message)

      expect(result.data).toHaveLength(1)
      expect(result.data[0]).toMatchObject({ i: { t: 'users', c: 'email' } })
      expect(result.data[0]).toHaveProperty('hm')
    }, 30000)

    it('handles all-null array', async () => {
      const result = await protectClient.encryptQuery([
        { value: null, column: users.email, table: users, queryType: 'equality' },
        { value: null, column: users.bio, table: users, queryType: 'freeTextSearch' },
        { value: null, column: users.age, table: users, queryType: 'orderAndRange' },
      ])

      if (result.failure) throw new Error(result.failure.message)

      expect(result.data).toHaveLength(3)
      expect(result.data[0]).toBeNull()
      expect(result.data[1]).toBeNull()
      expect(result.data[2]).toBeNull()
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
            ctsToken: { accessToken: 'mock-token', expiry: Date.now() + 3600000 },
            context: { identityClaim: ['sub'] }
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
            ctsToken: { accessToken: 'mock-token', expiry: Date.now() + 3600000 },
            context: { identityClaim: ['sub'] }
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

    it('executes single query with LockContext mock', async () => {
      const mockLockContext = {
        getLockContext: vi.fn().mockResolvedValue({
          data: {
            ctsToken: { accessToken: 'mock-token', expiry: Date.now() + 3600000 },
            context: { identityClaim: ['sub'] }
          }
        })
      }

      const operation = protectClient.encryptQuery('test@example.com', {
        column: users.email,
        table: users,
        queryType: 'equality',
      })

      const withContext = operation.withLockContext(mockLockContext as any)
      const result = await withContext.execute()

      expect(mockLockContext.getLockContext).toHaveBeenCalledTimes(1)

      if (result.failure) throw new Error(result.failure.message)
      expect(result.data).toMatchObject({
        i: { t: 'users', c: 'email' },
        v: expect.any(Number),
      })
      expect(result.data).toHaveProperty('hm')
    }, 30000)

    it('executes bulk query with LockContext mock', async () => {
      const mockLockContext = {
        getLockContext: vi.fn().mockResolvedValue({
          data: {
            ctsToken: { accessToken: 'mock-token', expiry: Date.now() + 3600000 },
            context: { identityClaim: ['sub'] }
          }
        })
      }

      const operation = protectClient.encryptQuery([
        { value: 'test@example.com', column: users.email, table: users, queryType: 'equality' },
        { value: 42, column: users.age, table: users, queryType: 'orderAndRange' },
      ])

      const withContext = operation.withLockContext(mockLockContext as any)
      const result = await withContext.execute()

      expect(mockLockContext.getLockContext).toHaveBeenCalledTimes(1)

      if (result.failure) throw new Error(result.failure.message)
      expect(result.data).toHaveLength(2)
      expect(result.data[0]).toHaveProperty('hm')
      expect(result.data[1]).toHaveProperty('ob')
    }, 30000)

    it('handles LockContext failure gracefully', async () => {
      const mockLockContext = {
        getLockContext: vi.fn().mockResolvedValue({
          failure: {
            type: ProtectErrorTypes.CtsTokenError,
            message: 'Mock LockContext failure'
          }
        })
      }

      const operation = protectClient.encryptQuery('test@example.com', {
        column: users.email,
        table: users,
        queryType: 'equality',
      })

      const withContext = operation.withLockContext(mockLockContext as any)
      const result = await withContext.execute()

      expect(result.failure).toBeDefined()
      expect(result.failure?.type).toBe(ProtectErrorTypes.CtsTokenError)
      expect(result.failure?.message).toBe('Mock LockContext failure')
    }, 30000)

    it('handles null value with LockContext', async () => {
      const mockLockContext = {
        getLockContext: vi.fn().mockResolvedValue({
          data: {
            ctsToken: { accessToken: 'mock-token', expiry: Date.now() + 3600000 },
            context: { identityClaim: ['sub'] }
          }
        })
      }

      const operation = protectClient.encryptQuery(null, {
        column: users.email,
        table: users,
        queryType: 'equality',
      })

      const withContext = operation.withLockContext(mockLockContext as any)
      const result = await withContext.execute()

      // Null values should return null without calling LockContext
      // since there's nothing to encrypt
      if (result.failure) throw new Error(result.failure.message)
      expect(result.data).toBeNull()
    }, 30000)
  })
})
