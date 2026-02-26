import 'dotenv/config'
import type { EncryptionClient } from '@/encryption'
import { EncryptionErrorTypes } from '@/errors'
import { Encryption } from '@/index'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  contract,
  createFailingMockLockContext,
  createMockLockContext,
  createMockLockContextWithNullContext,
  expectFailure,
  unwrapResult,
} from './fixtures'

describe('encryptQuery', () => {
  let protectClient: EncryptionClient

  beforeAll(async () => {
    protectClient = await Encryption({
      contract,
    })
  })

  describe('single value encryption with explicit queryType', () => {
    it('encrypts for equality query type', async () => {
      const result = await protectClient.encryptQuery('test@example.com', {
        contract: contract.users.email,
        queryType: 'equality',
      })

      const data = unwrapResult(result)

      expect(data).toMatchObject({
        i: { t: 'users', c: 'email' },
        v: 2,
      })
      expect(data).toHaveProperty('hm')
    }, 30000)

    it('encrypts for freeTextSearch query type', async () => {
      const result = await protectClient.encryptQuery('hello world', {
        contract: contract.users.bio,
        queryType: 'freeTextSearch',
      })

      const data = unwrapResult(result)

      expect(data).toMatchObject({
        i: { t: 'users', c: 'bio' },
        v: 2,
      })
      expect(data).toHaveProperty('bf')
    }, 30000)

    it('encrypts for orderAndRange query type', async () => {
      const result = await protectClient.encryptQuery(25, {
        contract: contract.users.age,
        queryType: 'orderAndRange',
      })

      const data = unwrapResult(result)

      expect(data).toMatchObject({
        i: { t: 'users', c: 'age' },
        v: 2,
      })
      expect(data).toHaveProperty('ob')
    }, 30000)
  })

  describe('auto-inference when queryType omitted', () => {
    it('auto-infers equality for column with .equality()', async () => {
      const result = await protectClient.encryptQuery('test@example.com', {
        contract: contract.users.email,
      })

      const data = unwrapResult(result)
      expect(data).toHaveProperty('hm')
    }, 30000)

    it('auto-infers freeTextSearch for match-only column', async () => {
      const result = await protectClient.encryptQuery('search content', {
        contract: contract.articles.content,
      })

      const data = unwrapResult(result)
      expect(data).toHaveProperty('bf')
    }, 30000)

    it('auto-infers orderAndRange for ore-only column', async () => {
      const result = await protectClient.encryptQuery(99.99, {
        contract: contract.products.price,
      })

      const data = unwrapResult(result)
      expect(data).toHaveProperty('ob')
    }, 30000)
  })

  describe('edge cases', () => {
    it('rejects NaN values', async () => {
      const result = await protectClient.encryptQuery(Number.NaN, {
        contract: contract.users.age,
        queryType: 'orderAndRange',
      })

      expectFailure(result, 'NaN')
    }, 30000)

    it('rejects Infinity values', async () => {
      const result = await protectClient.encryptQuery(
        Number.POSITIVE_INFINITY,
        {
          contract: contract.users.age,
          queryType: 'orderAndRange',
        },
      )

      expectFailure(result, 'Infinity')
    }, 30000)

    it('rejects negative Infinity values', async () => {
      const result = await protectClient.encryptQuery(
        Number.NEGATIVE_INFINITY,
        {
          contract: contract.users.age,
          queryType: 'orderAndRange',
        },
      )

      expectFailure(result, 'Infinity')
    }, 30000)
  })

  describe('validation errors', () => {
    it('fails when queryType does not match column config', async () => {
      const result = await protectClient.encryptQuery('test@example.com', {
        contract: contract.users.email,
        queryType: 'freeTextSearch', // email only has equality
      })

      expectFailure(result, 'not configured')
    }, 30000)

    it('fails when column has no indexes configured', async () => {
      const result = await protectClient.encryptQuery('raw data', {
        contract: contract.metadata.raw,
      })

      expectFailure(result, 'no indexes configured')
    }, 30000)

    it('provides descriptive error for queryType mismatch', async () => {
      const result = await protectClient.encryptQuery(42, {
        contract: contract.users.age,
        queryType: 'equality', // age only has orderAndRange
      })

      expectFailure(result, 'unique')
      expectFailure(
        result,
        'not configured',
        EncryptionErrorTypes.EncryptionError,
      )
    }, 30000)
  })

  describe('value/index type compatibility', () => {
    it('fails when encrypting number with match index (explicit queryType)', async () => {
      const result = await protectClient.encryptQuery(123, {
        contract: contract.articles.content, // match-only column
        queryType: 'freeTextSearch',
      })

      expectFailure(result, 'match')
      expectFailure(result, 'numeric')
    }, 30000)

    it('fails when encrypting number with auto-inferred match index', async () => {
      const result = await protectClient.encryptQuery(123, {
        contract: contract.articles.content, // match-only column, will infer 'match'
      })

      expectFailure(result, 'match')
    }, 30000)

    it('fails in batch when number used with match index', async () => {
      const result = await protectClient.encryptQuery([
        { value: 123, contract: contract.articles.content },
      ])

      expectFailure(result, 'match')
    }, 30000)

    it('allows string with match index', async () => {
      const result = await protectClient.encryptQuery('search text', {
        contract: contract.articles.content,
      })

      const data = unwrapResult(result)
      expect(data).toHaveProperty('bf') // bloom filter
    }, 30000)

    it('allows number with ore index', async () => {
      const result = await protectClient.encryptQuery(42, {
        contract: contract.users.age,
        queryType: 'orderAndRange',
      })

      const data = unwrapResult(result)
      expect(data).toHaveProperty('ob') // order bits
    }, 30000)
  })

  describe('numeric edge cases', () => {
    it('encrypts MAX_SAFE_INTEGER', async () => {
      const result = await protectClient.encryptQuery(Number.MAX_SAFE_INTEGER, {
        contract: contract.users.age,
        queryType: 'orderAndRange',
      })

      const data = unwrapResult(result)
      expect(data).toMatchObject({
        i: { t: 'users', c: 'age' },
        v: 2,
      })
      expect(data).toHaveProperty('ob')
    }, 30000)

    it('encrypts MIN_SAFE_INTEGER', async () => {
      const result = await protectClient.encryptQuery(Number.MIN_SAFE_INTEGER, {
        contract: contract.users.age,
        queryType: 'orderAndRange',
      })

      const data = unwrapResult(result)
      expect(data).toMatchObject({
        i: { t: 'users', c: 'age' },
        v: 2,
      })
      expect(data).toHaveProperty('ob')
    }, 30000)

    it('encrypts negative zero', async () => {
      const result = await protectClient.encryptQuery(-0, {
        contract: contract.users.age,
        queryType: 'orderAndRange',
      })

      const data = unwrapResult(result)
      expect(data).toHaveProperty('ob')
    }, 30000)
  })

  describe('string edge cases', () => {
    it('encrypts empty string', async () => {
      const result = await protectClient.encryptQuery('', {
        contract: contract.users.email,
        queryType: 'equality',
      })

      const data = unwrapResult(result)
      expect(data).toMatchObject({
        i: { t: 'users', c: 'email' },
        v: 2,
      })
      expect(data).toHaveProperty('hm')
    }, 30000)

    it('encrypts unicode/emoji strings', async () => {
      const result = await protectClient.encryptQuery('Hello 世界 🌍🚀', {
        contract: contract.users.bio,
        queryType: 'freeTextSearch',
      })

      const data = unwrapResult(result)
      expect(data).toMatchObject({
        i: { t: 'users', c: 'bio' },
        v: 2,
      })
      expect(data).toHaveProperty('bf')
    }, 30000)

    it('encrypts strings with SQL special characters', async () => {
      const result = await protectClient.encryptQuery(
        "'; DROP TABLE users; --",
        {
          contract: contract.users.email,
          queryType: 'equality',
        },
      )

      const data = unwrapResult(result)
      expect(data).toMatchObject({
        i: { t: 'users', c: 'email' },
        v: 2,
      })
      expect(data).toHaveProperty('hm')
    }, 30000)
  })

  describe('encryptQuery bulk (array overload)', () => {
    it('encrypts multiple terms in batch', async () => {
      const result = await protectClient.encryptQuery([
        {
          value: 'user@example.com',
          contract: contract.users.email,
          queryType: 'equality',
        },
        {
          value: 'search term',
          contract: contract.users.bio,
          queryType: 'freeTextSearch',
        },
        {
          value: 42,
          contract: contract.users.age,
          queryType: 'orderAndRange',
        },
      ])

      const data = unwrapResult(result)

      expect(data).toHaveLength(3)
      expect(data[0]).toMatchObject({ i: { t: 'users', c: 'email' } })
      expect(data[1]).toMatchObject({ i: { t: 'users', c: 'bio' } })
      expect(data[2]).toMatchObject({ i: { t: 'users', c: 'age' } })
    }, 30000)

    it('handles empty array', async () => {
      // Empty arrays without opts are treated as empty batch for backward compatibility
      const result = await protectClient.encryptQuery([])

      const data = unwrapResult(result)
      expect(data).toEqual([])
    }, 30000)

    it('auto-infers queryType when omitted', async () => {
      const result = await protectClient.encryptQuery([
        { value: 'user@example.com', contract: contract.users.email },
        { value: 42, contract: contract.users.age },
      ])

      const data = unwrapResult(result)

      expect(data).toHaveLength(2)
      expect(data[0]).toHaveProperty('hm')
      expect(data[1]).toHaveProperty('ob')
    }, 30000)

    it('rejects NaN/Infinity values in batch', async () => {
      const result = await protectClient.encryptQuery([
        {
          value: Number.NaN,
          contract: contract.users.age,
          queryType: 'orderAndRange',
        },
        {
          value: Number.POSITIVE_INFINITY,
          contract: contract.users.age,
          queryType: 'orderAndRange',
        },
      ])

      expect(result.failure).toBeDefined()
    }, 30000)

    it('rejects negative Infinity in batch', async () => {
      const result = await protectClient.encryptQuery([
        {
          value: Number.NEGATIVE_INFINITY,
          contract: contract.users.age,
          queryType: 'orderAndRange',
        },
      ])

      expectFailure(result, 'Infinity')
    }, 30000)
  })

  describe('bulk index preservation', () => {
    it('handles single-item array', async () => {
      const result = await protectClient.encryptQuery([
        {
          value: 'single@example.com',
          contract: contract.users.email,
          queryType: 'equality',
        },
      ])

      const data = unwrapResult(result)

      expect(data).toHaveLength(1)
      expect(data[0]).toMatchObject({ i: { t: 'users', c: 'email' } })
      expect(data[0]).toHaveProperty('hm')
    }, 30000)

  })

  describe('audit support', () => {
    it('passes audit metadata for single query', async () => {
      const result = await protectClient
        .encryptQuery('test@example.com', {
          contract: contract.users.email,
          queryType: 'equality',
        })
        .audit({ metadata: { userId: 'test-user' } })

      const data = unwrapResult(result)
      expect(data).toMatchObject({ i: { t: 'users', c: 'email' } })
    }, 30000)

    it('passes audit metadata for bulk query', async () => {
      const result = await protectClient
        .encryptQuery([
          {
            value: 'test@example.com',
            contract: contract.users.email,
            queryType: 'equality',
          },
        ])
        .audit({ metadata: { userId: 'test-user' } })

      const data = unwrapResult(result)
      expect(data).toHaveLength(1)
    }, 30000)
  })

  describe('returnType formatting', () => {
    it('returns Encrypted by default (no returnType)', async () => {
      const result = await protectClient.encryptQuery([
        {
          value: 'test@example.com',
          contract: contract.users.email,
          queryType: 'equality',
        },
      ])

      const data = unwrapResult(result)

      expect(data).toHaveLength(1)
      expect(data[0]).toMatchObject({
        i: { t: 'users', c: 'email' },
        v: 2,
      })
      expect(typeof data[0]).toBe('object')
    }, 30000)

    it('returns composite-literal format when specified', async () => {
      const result = await protectClient.encryptQuery([
        {
          value: 'test@example.com',
          contract: contract.users.email,
          queryType: 'equality',
          returnType: 'composite-literal',
        },
      ])

      const data = unwrapResult(result)

      expect(data).toHaveLength(1)
      expect(typeof data[0]).toBe('string')
      // Format: ("json")
      expect(data[0]).toMatch(/^\(".*"\)$/)
    }, 30000)

    it('returns escaped-composite-literal format when specified', async () => {
      const result = await protectClient.encryptQuery([
        {
          value: 'test@example.com',
          contract: contract.users.email,
          queryType: 'equality',
          returnType: 'escaped-composite-literal',
        },
      ])

      const data = unwrapResult(result)

      expect(data).toHaveLength(1)
      expect(typeof data[0]).toBe('string')
      // Format: "(\"json\")" - outer quotes with escaped inner quotes
      expect(data[0]).toMatch(/^"\(.*\)"$/)
    }, 30000)

    it('returns eql format when explicitly specified', async () => {
      const result = await protectClient.encryptQuery([
        {
          value: 'test@example.com',
          contract: contract.users.email,
          queryType: 'equality',
          returnType: 'eql',
        },
      ])

      const data = unwrapResult(result)

      expect(data).toHaveLength(1)
      expect(data[0]).toMatchObject({
        i: { t: 'users', c: 'email' },
        v: 2,
      })
      expect(typeof data[0]).toBe('object')
    }, 30000)

    it('handles mixed returnType values in same batch', async () => {
      const result = await protectClient.encryptQuery([
        {
          value: 'test@example.com',
          contract: contract.users.email,
          queryType: 'equality',
        }, // default
        {
          value: 'search term',
          contract: contract.users.bio,
          queryType: 'freeTextSearch',
          returnType: 'composite-literal',
        },
        {
          value: 42,
          contract: contract.users.age,
          queryType: 'orderAndRange',
          returnType: 'escaped-composite-literal',
        },
      ])

      const data = unwrapResult(result)

      expect(data).toHaveLength(3)

      // First: default (Encrypted object)
      expect(typeof data[0]).toBe('object')
      expect(data[0]).toMatchObject({ i: { t: 'users', c: 'email' } })

      // Second: composite-literal (string)
      expect(typeof data[1]).toBe('string')
      expect(data[1]).toMatch(/^\(".*"\)$/)

      // Third: escaped-composite-literal (string)
      expect(typeof data[2]).toBe('string')
      expect(data[2]).toMatch(/^"\(.*\)"$/)
    }, 30000)

  })

  describe('single-value returnType formatting', () => {
    it('returns Encrypted by default (no returnType)', async () => {
      const result = await protectClient.encryptQuery('test@example.com', {
        contract: contract.users.email,
        queryType: 'equality',
      })

      const data = unwrapResult(result)

      expect(data).toMatchObject({
        i: { t: 'users', c: 'email' },
        v: 2,
      })
      expect(typeof data).toBe('object')
    }, 30000)

    it('returns composite-literal format when specified', async () => {
      const result = await protectClient.encryptQuery('test@example.com', {
        contract: contract.users.email,
        queryType: 'equality',
        returnType: 'composite-literal',
      })

      const data = unwrapResult(result)

      expect(typeof data).toBe('string')
      // Format: ("json")
      expect(data).toMatch(/^\(".*"\)$/)
    }, 30000)

    it('returns escaped-composite-literal format when specified', async () => {
      const result = await protectClient.encryptQuery('test@example.com', {
        contract: contract.users.email,
        queryType: 'equality',
        returnType: 'escaped-composite-literal',
      })

      const data = unwrapResult(result)

      expect(typeof data).toBe('string')
      // Format: "(\"json\")" - outer quotes with escaped inner quotes
      expect(data).toMatch(/^"\(.*\)"$/)
    }, 30000)

    it('returns eql format when explicitly specified', async () => {
      const result = await protectClient.encryptQuery('test@example.com', {
        contract: contract.users.email,
        queryType: 'equality',
        returnType: 'eql',
      })

      const data = unwrapResult(result)

      expect(data).toMatchObject({
        i: { t: 'users', c: 'email' },
        v: 2,
      })
      expect(typeof data).toBe('object')
    }, 30000)

  })

  describe('LockContext support', () => {
    it('single query with LockContext calls getLockContext', async () => {
      const mockLockContext = createMockLockContext()

      const operation = protectClient.encryptQuery('test@example.com', {
        contract: contract.users.email,
        queryType: 'equality',
      })

      const withContext = operation.withLockContext(mockLockContext as any)
      expect(withContext).toHaveProperty('execute')
      expect(typeof withContext.execute).toBe('function')
    }, 30000)

    it('bulk query with LockContext calls getLockContext', async () => {
      const mockLockContext = createMockLockContext()

      const operation = protectClient.encryptQuery([
        {
          value: 'test@example.com',
          contract: contract.users.email,
          queryType: 'equality',
        },
      ])

      const withContext = operation.withLockContext(mockLockContext as any)
      expect(withContext).toHaveProperty('execute')
      expect(typeof withContext.execute).toBe('function')
    }, 30000)

    it('executes single query with LockContext mock', async () => {
      const mockLockContext = createMockLockContext()

      const operation = protectClient.encryptQuery('test@example.com', {
        contract: contract.users.email,
        queryType: 'equality',
      })

      const withContext = operation.withLockContext(mockLockContext as any)
      const result = await withContext.execute()

      expect(mockLockContext.getLockContext).toHaveBeenCalledTimes(1)

      const data = unwrapResult(result)
      expect(data).toMatchObject({
        i: { t: 'users', c: 'email' },
        v: 2,
      })
      expect(data).toHaveProperty('hm')
    }, 30000)

    it('executes bulk query with LockContext mock', async () => {
      const mockLockContext = createMockLockContext()

      const operation = protectClient.encryptQuery([
        {
          value: 'test@example.com',
          contract: contract.users.email,
          queryType: 'equality',
        },
        {
          value: 42,
          contract: contract.users.age,
          queryType: 'orderAndRange',
        },
      ])

      const withContext = operation.withLockContext(mockLockContext as any)
      const result = await withContext.execute()

      expect(mockLockContext.getLockContext).toHaveBeenCalledTimes(1)

      const data = unwrapResult(result)
      expect(data).toHaveLength(2)
      expect(data[0]).toHaveProperty('hm')
      expect(data[1]).toHaveProperty('ob')
    }, 30000)

    it('handles LockContext failure gracefully', async () => {
      const mockLockContext = createFailingMockLockContext(
        EncryptionErrorTypes.CtsTokenError,
        'Mock LockContext failure',
      )

      const operation = protectClient.encryptQuery('test@example.com', {
        contract: contract.users.email,
        queryType: 'equality',
      })

      const withContext = operation.withLockContext(mockLockContext as any)
      const result = await withContext.execute()

      expectFailure(
        result,
        'Mock LockContext failure',
        EncryptionErrorTypes.CtsTokenError,
      )
    }, 30000)

    it('handles explicit null context from getLockContext gracefully', async () => {
      // Simulate a runtime scenario where context is null (bypasses TypeScript)
      const mockLockContext = createMockLockContextWithNullContext()

      const operation = protectClient.encryptQuery([
        {
          value: 'test@example.com',
          contract: contract.users.email,
          queryType: 'equality',
        },
      ])

      const withContext = operation.withLockContext(mockLockContext as any)
      const result = await withContext.execute()

      // Should succeed - null context should not be passed to FFI
      const data = unwrapResult(result)
      expect(data).toHaveLength(1)
      expect(data[0]).toHaveProperty('hm')
    }, 30000)
  })
})
