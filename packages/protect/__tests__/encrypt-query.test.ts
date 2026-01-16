import 'dotenv/config'
import { csColumn, csTable } from '@cipherstash/schema'
import { describe, expect, it, beforeAll } from 'vitest'
import { type QuerySearchTerm, protect } from '../src'
import { LockContext } from '../src/identify'

const hasCredentials = Boolean(
  process.env.CS_CLIENT_ID && process.env.CS_CLIENT_KEY,
)

const schema = csTable('test_query', {
  email: csColumn('email').freeTextSearch().equality().orderAndRange(),
  score: csColumn('score').dataType('bigint').orderAndRange(),
  metadata: csColumn('metadata').searchableJson(),
})

describe.runIf(hasCredentials)('encryptQuery', () => {
  let protectClient: Awaited<ReturnType<typeof protect>>

  beforeAll(async () => {
    protectClient = await protect({ schemas: [schema] })
  })

  describe('ORE queries', () => {
    it('should create ORE query term for string', async () => {
      const result = await protectClient.encryptQuery('test@example.com', {
        column: schema.email,
        table: schema,
        indexType: 'ore',
      })

      if (result.failure) {
        throw new Error(result.failure.message)
      }

      expect(result.data).toHaveProperty('i')
      expect(result.data).toHaveProperty('v')
      expect(result.data).toHaveProperty('ob')
      expect(result.data).not.toHaveProperty('c') // No ciphertext in query mode
    }, 30000)

    it('should create ORE query term for number', async () => {
      const result = await protectClient.encryptQuery(100, {
        column: schema.score,
        table: schema,
        indexType: 'ore',
      })

      if (result.failure) {
        throw new Error(result.failure.message)
      }

      expect(result.data).toHaveProperty('ob')
      expect(result.data).not.toHaveProperty('c')
    }, 30000)
  })

  describe('match queries', () => {
    it('should create match query term', async () => {
      const result = await protectClient.encryptQuery('john', {
        column: schema.email,
        table: schema,
        indexType: 'match',
      })

      if (result.failure) {
        throw new Error(result.failure.message)
      }

      expect(result.data).toHaveProperty('bf')
      expect(Array.isArray(result.data?.bf)).toBe(true)
      expect(result.data).not.toHaveProperty('c')
    }, 30000)
  })

  describe('unique queries', () => {
    it('should create unique query term', async () => {
      const result = await protectClient.encryptQuery('test@example.com', {
        column: schema.email,
        table: schema,
        indexType: 'unique',
      })

      if (result.failure) {
        throw new Error(result.failure.message)
      }

      expect(result.data).toHaveProperty('hm')
      expect(typeof result.data?.hm).toBe('string')
      expect(result.data).not.toHaveProperty('c')
    }, 30000)
  })

  describe('ste_vec queries', () => {
    it('should create ste_vec default query with JSON value', async () => {
      const result = await protectClient.encryptQuery({ role: 'admin' }, {
        column: schema.metadata,
        table: schema,
        indexType: 'ste_vec',
      })

      if (result.failure) {
        throw new Error(result.failure.message)
      }

      expect(result.data).toBeDefined()
      expect(result.data).not.toHaveProperty('c')
    }, 30000)

    it('should create ste_vec selector query with JSON path', async () => {
      const result = await protectClient.encryptQuery('$.user.email', {
        column: schema.metadata,
        table: schema,
        indexType: 'ste_vec',
        queryOp: 'ste_vec_selector',
      })

      if (result.failure) {
        throw new Error(result.failure.message)
      }

      expect(result.data).toBeDefined()
      expect(result.data).not.toHaveProperty('c')
    }, 30000)

    it('should create ste_vec query with nested JSON object', async () => {
      const result = await protectClient.encryptQuery(
        { user: { role: 'admin', level: 5 } },
        {
          column: schema.metadata,
          table: schema,
          indexType: 'ste_vec',
        },
      )

      if (result.failure) {
        throw new Error(result.failure.message)
      }

      expect(result.data).toBeDefined()
      expect(result.data).not.toHaveProperty('c')
    }, 30000)
  })

  describe('null handling', () => {
    it('should handle null plaintext', async () => {
      const result = await protectClient.encryptQuery(null, {
        column: schema.email,
        table: schema,
        indexType: 'unique',
      })

      if (result.failure) {
        throw new Error(result.failure.message)
      }

      expect(result.data).toBeNull()
    }, 30000)
  })
})

describe.runIf(hasCredentials)('createQuerySearchTerms', () => {
  let protectClient: Awaited<ReturnType<typeof protect>>

  beforeAll(async () => {
    protectClient = await protect({ schemas: [schema] })
  })

  it('should encrypt multiple query terms', async () => {
    const result = await protectClient.createQuerySearchTerms([
      {
        value: 'test@example.com',
        column: schema.email,
        table: schema,
        indexType: 'unique',
      },
      {
        value: 100,
        column: schema.score,
        table: schema,
        indexType: 'ore',
      },
    ])

    if (result.failure) {
      throw new Error(result.failure.message)
    }

    expect(result.data).toHaveLength(2)
    expect(result.data[0]).toHaveProperty('hm')
    expect(result.data[1]).toHaveProperty('ob')
    // Neither should have ciphertext
    expect(result.data[0]).not.toHaveProperty('c')
    expect(result.data[1]).not.toHaveProperty('c')
  }, 30000)

  it('should preserve order in bulk operations', async () => {
    const values = ['a@example.com', 'b@example.com', 'c@example.com']
    const result = await protectClient.createQuerySearchTerms(
      values.map((value) => ({
        value,
        column: schema.email,
        table: schema,
        indexType: 'unique',
      })),
    )

    if (result.failure) {
      throw new Error(result.failure.message)
    }

    expect(result.data).toHaveLength(3)
    // HMACs should be different for different inputs
    const hmacs = result.data.map((d) => (d as Record<string, unknown>)?.hm)
    expect(new Set(hmacs).size).toBe(3)
  }, 30000)

  it('should support composite-literal return type', async () => {
    const result = await protectClient.createQuerySearchTerms([
      {
        value: 'test@example.com',
        column: schema.email,
        table: schema,
        indexType: 'unique',
        returnType: 'composite-literal',
      },
    ])

    if (result.failure) {
      throw new Error(result.failure.message)
    }

    expect(typeof result.data[0]).toBe('string')
    expect((result.data[0] as string).startsWith('(')).toBe(true)
  }, 30000)

  it('should support mixed index types in bulk', async () => {
    const terms: QuerySearchTerm[] = [
      {
        value: 'user@example.com',
        column: schema.email,
        table: schema,
        indexType: 'unique',
      },
      {
        value: 'john',
        column: schema.email,
        table: schema,
        indexType: 'match',
      },
      {
        value: 'z@example.com',
        column: schema.email,
        table: schema,
        indexType: 'ore',
      },
    ]

    const result = await protectClient.createQuerySearchTerms(terms)

    if (result.failure) {
      throw new Error(result.failure.message)
    }

    expect(result.data).toHaveLength(3)
    expect(result.data[0]).toHaveProperty('hm') // unique
    expect(result.data[1]).toHaveProperty('bf') // match
    expect(result.data[2]).toHaveProperty('ob') // ore
  }, 30000)

  describe('bulk edge cases', () => {
    it('should handle empty array', async () => {
      const result = await protectClient.createQuerySearchTerms([])

      if (result.failure) {
        throw new Error(result.failure.message)
      }

      expect(result.data).toHaveLength(0)
    }, 30000)

    it('should support mixed return types in single batch', async () => {
      const result = await protectClient.createQuerySearchTerms([
        {
          value: 'test@example.com',
          column: schema.email,
          table: schema,
          indexType: 'unique',
          returnType: 'eql',
        },
        {
          value: 'user@example.com',
          column: schema.email,
          table: schema,
          indexType: 'unique',
          returnType: 'composite-literal',
        },
      ])

      if (result.failure) {
        throw new Error(result.failure.message)
      }

      expect(result.data).toHaveLength(2)
      // First should be object (eql format)
      expect(typeof result.data[0]).toBe('object')
      expect(result.data[0]).toHaveProperty('hm')
      // Second should be string (composite-literal)
      expect(typeof result.data[1]).toBe('string')
      expect((result.data[1] as string).startsWith('(')).toBe(true)
    }, 30000)
  })
})

describe.runIf(hasCredentials)('encryptQuery with lock context', () => {
  let protectClient: Awaited<ReturnType<typeof protect>>

  beforeAll(async () => {
    protectClient = await protect({ schemas: [schema] })
  })

  it('should encrypt single query with lock context', async () => {
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
      .encryptQuery('test@example.com', {
        column: schema.email,
        table: schema,
        indexType: 'unique',
      })
      .withLockContext(lockContext.data)

    if (result.failure) {
      throw new Error(result.failure.message)
    }

    expect(result.data).toHaveProperty('hm')
    expect(result.data).not.toHaveProperty('c')
  }, 30000)

  it('should encrypt ORE query with lock context', async () => {
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
      .encryptQuery(100, {
        column: schema.score,
        table: schema,
        indexType: 'ore',
      })
      .withLockContext(lockContext.data)

    if (result.failure) {
      throw new Error(result.failure.message)
    }

    expect(result.data).toHaveProperty('ob')
    expect(result.data).not.toHaveProperty('c')
  }, 30000)

  it('should encrypt ste_vec query with lock context', async () => {
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
      .encryptQuery({ role: 'admin' }, {
        column: schema.metadata,
        table: schema,
        indexType: 'ste_vec',
      })
      .withLockContext(lockContext.data)

    if (result.failure) {
      throw new Error(result.failure.message)
    }

    expect(result.data).toBeDefined()
    expect(result.data).not.toHaveProperty('c')
  }, 30000)
})

describe.runIf(hasCredentials)('createQuerySearchTerms with lock context', () => {
  let protectClient: Awaited<ReturnType<typeof protect>>

  beforeAll(async () => {
    protectClient = await protect({ schemas: [schema] })
  })

  it('should encrypt bulk queries with lock context', async () => {
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
      .createQuerySearchTerms([
        {
          value: 'test@example.com',
          column: schema.email,
          table: schema,
          indexType: 'unique',
        },
        {
          value: 100,
          column: schema.score,
          table: schema,
          indexType: 'ore',
        },
      ])
      .withLockContext(lockContext.data)

    if (result.failure) {
      throw new Error(result.failure.message)
    }

    expect(result.data).toHaveLength(2)
    expect(result.data[0]).toHaveProperty('hm')
    expect(result.data[1]).toHaveProperty('ob')
    expect(result.data[0]).not.toHaveProperty('c')
    expect(result.data[1]).not.toHaveProperty('c')
  }, 30000)
})

describe.runIf(hasCredentials)('encryptQuery boundary conditions', () => {
  let protectClient: Awaited<ReturnType<typeof protect>>

  beforeAll(async () => {
    protectClient = await protect({ schemas: [schema] })
  })

  describe('string edge cases', () => {
    it('should handle empty string', async () => {
      const result = await protectClient.encryptQuery('', {
        column: schema.email,
        table: schema,
        indexType: 'unique',
      })

      if (result.failure) {
        throw new Error(result.failure.message)
      }

      expect(result.data).toHaveProperty('hm')
    }, 30000)

    it('should handle Unicode characters', async () => {
      const result = await protectClient.encryptQuery('用户@例子.com', {
        column: schema.email,
        table: schema,
        indexType: 'unique',
      })

      if (result.failure) {
        throw new Error(result.failure.message)
      }

      expect(result.data).toHaveProperty('hm')
    }, 30000)

    it('should handle emoji', async () => {
      const result = await protectClient.encryptQuery('test🔐@example.com', {
        column: schema.email,
        table: schema,
        indexType: 'unique',
      })

      if (result.failure) {
        throw new Error(result.failure.message)
      }

      expect(result.data).toHaveProperty('hm')
    }, 30000)

    it('should handle very long string', async () => {
      const longString = 'a'.repeat(10000) + '@example.com'
      const result = await protectClient.encryptQuery(longString, {
        column: schema.email,
        table: schema,
        indexType: 'unique',
      })

      if (result.failure) {
        throw new Error(result.failure.message)
      }

      expect(result.data).toHaveProperty('hm')
    }, 30000)
  })

  describe('numeric edge cases', () => {
    it('should handle zero', async () => {
      const result = await protectClient.encryptQuery(0, {
        column: schema.score,
        table: schema,
        indexType: 'ore',
      })

      if (result.failure) {
        throw new Error(result.failure.message)
      }

      expect(result.data).toHaveProperty('ob')
    }, 30000)

    it('should handle negative numbers', async () => {
      const result = await protectClient.encryptQuery(-999, {
        column: schema.score,
        table: schema,
        indexType: 'ore',
      })

      if (result.failure) {
        throw new Error(result.failure.message)
      }

      expect(result.data).toHaveProperty('ob')
    }, 30000)

    it('should handle very large numbers', async () => {
      const result = await protectClient.encryptQuery(Number.MAX_SAFE_INTEGER, {
        column: schema.score,
        table: schema,
        indexType: 'ore',
      })

      if (result.failure) {
        throw new Error(result.failure.message)
      }

      expect(result.data).toHaveProperty('ob')
    }, 30000)
  })
})
