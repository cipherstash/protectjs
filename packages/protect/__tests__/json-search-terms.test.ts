import 'dotenv/config'
import { csColumn, csTable } from '@cipherstash/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { protect } from '../src'
import { LockContext } from '../src/identify'

// Check for CipherStash credentials - skip tests if not available
const hasCredentials = Boolean(
  process.env.CS_CLIENT_ID && process.env.CS_CLIENT_KEY
)

const schema = csTable('test_json_search', {
  metadata: csColumn('metadata').searchableJson(),
})

describe.runIf(hasCredentials)('JsonSearchTermsOperation', () => {
  let protectClient: Awaited<ReturnType<typeof protect>>

  beforeAll(async () => {
    protectClient = await protect({ schemas: [schema] })
  })

  describe('path queries', () => {
    it('should create encrypted search term for path access', async () => {
      const result = await protectClient.createJsonSearchTerms([
        {
          path: 'user.email',
          value: 'test@example.com',
          column: schema.metadata,
          table: schema,
        },
      ])

      if (result.failure) {
        throw new Error(result.failure.message)
      }

      expect(result.data).toHaveLength(1)
      // Query mode produces SEM-only payload (no ciphertext 'c' field)
      expect(result.data[0]).toHaveProperty('s') // selector
      expect(result.data[0].s).toBe('test_json_search/metadata/user/email')
    }, 30000)

    it('should accept path as array', async () => {
      const result = await protectClient.createJsonSearchTerms([
        {
          path: ['user', 'profile', 'name'],
          value: 'John',
          column: schema.metadata,
          table: schema,
        },
      ])

      if (result.failure) {
        throw new Error(result.failure.message)
      }

      expect(result.data[0].s).toBe('test_json_search/metadata/user/profile/name')
    }, 30000)
  })

  describe('containment queries', () => {
    it('should create encrypted search term for containment', async () => {
      const result = await protectClient.createJsonSearchTerms([
        {
          value: { role: 'admin' },
          column: schema.metadata,
          table: schema,
          containmentType: 'contains',
        },
      ])

      if (result.failure) {
        throw new Error(result.failure.message)
      }

      expect(result.data).toHaveLength(1)
      expect(result.data[0]).toHaveProperty('sv') // SteVec array
      expect(result.data[0].sv).toHaveLength(1)
      expect(result.data[0].sv[0].s).toBe('test_json_search/metadata/role')
    }, 30000)

    it('should flatten nested objects for containment', async () => {
      const result = await protectClient.createJsonSearchTerms([
        {
          value: { user: { role: 'admin', active: true } },
          column: schema.metadata,
          table: schema,
          containmentType: 'contains',
        },
      ])

      if (result.failure) {
        throw new Error(result.failure.message)
      }

      expect(result.data[0].sv).toHaveLength(2)
      const selectors = result.data[0].sv.map((e: { s: string }) => e.s).sort()
      expect(selectors).toEqual([
        'test_json_search/metadata/user/active',
        'test_json_search/metadata/user/role',
      ])
    }, 30000)
  })

  describe('error handling', () => {
    it('should throw if column does not have ste_vec index', async () => {
      const nonSearchableSchema = csTable('plain', {
        data: csColumn('data').dataType('json'), // no searchableJson()
      })
      const client = await protect({ schemas: [nonSearchableSchema] })

      const result = await client.createJsonSearchTerms([
        {
          path: 'test',
          value: 'value',
          column: nonSearchableSchema.data,
          table: nonSearchableSchema,
        },
      ])

      expect(result.failure).toBeDefined()
      expect(result.failure?.message).toContain('ste_vec')
    }, 30000)
  })

  describe('containment type variations', () => {
    it('should create search term for contained_by', async () => {
      const result = await protectClient.createJsonSearchTerms([
        {
          value: { role: 'admin' },
          column: schema.metadata,
          table: schema,
          containmentType: 'contained_by',
        },
      ])

      if (result.failure) {
        throw new Error(result.failure.message)
      }

      // contained_by uses same encryption, differentiation happens at SQL level
      expect(result.data).toHaveLength(1)
      expect(result.data[0]).toHaveProperty('sv')
      expect(result.data[0].sv).toHaveLength(1)
    }, 30000)
  })

  describe('deep nesting', () => {
    it('should handle deeply nested objects (5+ levels)', async () => {
      const result = await protectClient.createJsonSearchTerms([
        {
          value: { a: { b: { c: { d: { e: 'deep_value' } } } } },
          column: schema.metadata,
          table: schema,
          containmentType: 'contains',
        },
      ])

      if (result.failure) {
        throw new Error(result.failure.message)
      }

      expect(result.data).toHaveLength(1)
      expect(result.data[0]).toHaveProperty('sv')
      expect(result.data[0].sv).toHaveLength(1)
      expect(result.data[0].sv[0].s).toBe('test_json_search/metadata/a/b/c/d/e')
    }, 30000)

    it('should handle deeply nested path query', async () => {
      const result = await protectClient.createJsonSearchTerms([
        {
          path: ['level1', 'level2', 'level3', 'level4', 'level5'],
          value: 'deep',
          column: schema.metadata,
          table: schema,
        },
      ])

      if (result.failure) {
        throw new Error(result.failure.message)
      }

      expect(result.data[0].s).toBe('test_json_search/metadata/level1/level2/level3/level4/level5')
    }, 30000)
  })

  describe('special values', () => {
    it('should handle boolean values in containment', async () => {
      const result = await protectClient.createJsonSearchTerms([
        {
          value: { active: true },
          column: schema.metadata,
          table: schema,
          containmentType: 'contains',
        },
      ])

      if (result.failure) {
        throw new Error(result.failure.message)
      }

      expect(result.data[0]).toHaveProperty('sv')
      expect(result.data[0].sv).toHaveLength(1)
    }, 30000)

    it('should handle numeric values in containment', async () => {
      const result = await protectClient.createJsonSearchTerms([
        {
          value: { count: 42 },
          column: schema.metadata,
          table: schema,
          containmentType: 'contains',
        },
      ])

      if (result.failure) {
        throw new Error(result.failure.message)
      }

      expect(result.data[0]).toHaveProperty('sv')
      expect(result.data[0].sv).toHaveLength(1)
    }, 30000)

    it('should handle null values in path query', async () => {
      const result = await protectClient.createJsonSearchTerms([
        {
          path: 'field',
          value: null,
          column: schema.metadata,
          table: schema,
        },
      ])

      if (result.failure) {
        throw new Error(result.failure.message)
      }

      expect(result.data).toHaveLength(1)
      expect(result.data[0]).toHaveProperty('s')
    }, 30000)

    it('should handle Unicode values', async () => {
      const result = await protectClient.createJsonSearchTerms([
        {
          path: 'name',
          value: '日本語テスト',
          column: schema.metadata,
          table: schema,
        },
      ])

      if (result.failure) {
        throw new Error(result.failure.message)
      }

      expect(result.data[0]).toHaveProperty('s')
    }, 30000)

    it('should handle emoji in values', async () => {
      const result = await protectClient.createJsonSearchTerms([
        {
          path: 'emoji',
          value: '🔐🛡️',
          column: schema.metadata,
          table: schema,
        },
      ])

      if (result.failure) {
        throw new Error(result.failure.message)
      }

      expect(result.data[0]).toHaveProperty('s')
    }, 30000)
  })

  describe('path edge cases', () => {
    it('should handle single-element path', async () => {
      const result = await protectClient.createJsonSearchTerms([
        {
          path: ['field'],
          value: 'value',
          column: schema.metadata,
          table: schema,
        },
      ])

      if (result.failure) {
        throw new Error(result.failure.message)
      }

      expect(result.data[0].s).toBe('test_json_search/metadata/field')
    }, 30000)

    it('should handle path with underscores', async () => {
      const result = await protectClient.createJsonSearchTerms([
        {
          path: 'user_profile.first_name',
          value: 'John',
          column: schema.metadata,
          table: schema,
        },
      ])

      if (result.failure) {
        throw new Error(result.failure.message)
      }

      expect(result.data[0].s).toBe('test_json_search/metadata/user_profile/first_name')
    }, 30000)

    it('should handle numeric string keys', async () => {
      const result = await protectClient.createJsonSearchTerms([
        {
          path: ['items', '0', 'name'],
          value: 'first',
          column: schema.metadata,
          table: schema,
        },
      ])

      if (result.failure) {
        throw new Error(result.failure.message)
      }

      expect(result.data[0].s).toBe('test_json_search/metadata/items/0/name')
    }, 30000)
  })

  describe('bulk operations', () => {
    it('should handle multiple terms in single call', async () => {
      const result = await protectClient.createJsonSearchTerms([
        {
          path: 'field1',
          value: 'value1',
          column: schema.metadata,
          table: schema,
        },
        {
          path: 'field2',
          value: 'value2',
          column: schema.metadata,
          table: schema,
        },
        {
          value: { key: 'value3' },
          column: schema.metadata,
          table: schema,
          containmentType: 'contains',
        },
      ])

      if (result.failure) {
        throw new Error(result.failure.message)
      }

      expect(result.data).toHaveLength(3)
      expect(result.data[0]).toHaveProperty('s')
      expect(result.data[1]).toHaveProperty('s')
      expect(result.data[2]).toHaveProperty('sv')
    }, 30000)

    it('should handle empty array', async () => {
      const result = await protectClient.createJsonSearchTerms([])

      if (result.failure) {
        throw new Error(result.failure.message)
      }

      expect(result.data).toHaveLength(0)
    }, 30000)
  })
})

describe.runIf(hasCredentials)('JsonSearchTermsOperation with lock context', () => {
  let protectClient: Awaited<ReturnType<typeof protect>>

  beforeAll(async () => {
    protectClient = await protect({ schemas: [schema] })
  })

  it('should create path query with lock context', async () => {
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

    const result = await protectClient
      .createJsonSearchTerms([
        {
          path: 'user.email',
          value: 'test@example.com',
          column: schema.metadata,
          table: schema,
        },
      ])
      .withLockContext(lockContext.data)

    if (result.failure) {
      throw new Error(result.failure.message)
    }

    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toHaveProperty('s')
  }, 30000)

  it('should create containment query with lock context', async () => {
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

    const result = await protectClient
      .createJsonSearchTerms([
        {
          value: { role: 'admin', active: true },
          column: schema.metadata,
          table: schema,
          containmentType: 'contains',
        },
      ])
      .withLockContext(lockContext.data)

    if (result.failure) {
      throw new Error(result.failure.message)
    }

    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toHaveProperty('sv')
    expect(result.data[0].sv).toHaveLength(2)
  }, 30000)

  it('should create bulk queries with lock context', async () => {
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

    const result = await protectClient
      .createJsonSearchTerms([
        {
          path: 'name',
          value: 'test',
          column: schema.metadata,
          table: schema,
        },
        {
          value: { type: 'admin' },
          column: schema.metadata,
          table: schema,
          containmentType: 'contains',
        },
      ])
      .withLockContext(lockContext.data)

    if (result.failure) {
      throw new Error(result.failure.message)
    }

    expect(result.data).toHaveLength(2)
  }, 30000)
})
