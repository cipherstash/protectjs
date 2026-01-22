import 'dotenv/config'
import { csColumn, csTable } from '@cipherstash/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { LockContext, type QueryTerm, protect } from '../src'

const users = csTable('users', {
  email: csColumn('email').freeTextSearch().equality().orderAndRange(),
  score: csColumn('score').dataType('number').orderAndRange(),
})

const jsonSchema = csTable('json_users', {
  metadata: csColumn('metadata').searchableJson(),
})

let protectClient: Awaited<ReturnType<typeof protect>>

beforeAll(async () => {
  protectClient = await protect({ schemas: [users, jsonSchema] })
})

describe('encryptQuery batch overload', () => {
  it('should return empty array for empty input', async () => {
    const result = await protectClient.encryptQuery([])

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toEqual([])
  })

  it('should encrypt batch of scalar terms', async () => {
    const terms: QueryTerm[] = [
      {
        value: 'test@example.com',
        column: users.email,
        table: users,
        queryType: 'equality',
      },
      { value: 100, column: users.score, table: users, queryType: 'orderAndRange' },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(2)
    expect(result.data[0]).toHaveProperty('hm') // unique returns HMAC
  })
})

describe('encryptQuery batch - JSON path queries', () => {
  it('should encrypt JSON path query with value', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'user.email',
        value: 'test@example.com',
        column: jsonSchema.metadata,
        table: jsonSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    // s should be an encrypted selector (string token)
    expect((result.data[0] as any).s).toMatch(/^[0-9a-f]+$/)
  })

  it('should encrypt JSON path query without value (selector only)', async () => {
    const terms: QueryTerm[] = [
      { path: 'user.role', column: jsonSchema.metadata, table: jsonSchema },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expect((result.data[0] as any).s).toMatch(/^[0-9a-f]+$/)
  })
})

describe('encryptQuery batch - JSON containment queries', () => {
  it('should encrypt JSON contains query', async () => {
    const terms: QueryTerm[] = [
      {
        contains: { role: 'admin' },
        column: jsonSchema.metadata,
        table: jsonSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toHaveProperty('sv')
    const sv = (result.data[0] as any).sv
    expect(sv).toHaveLength(1)
    // s should be an encrypted selector (string token)
    expect(sv[0].s).toMatch(/^[0-9a-f]+$/)
  })

  it('should encrypt JSON containedBy query', async () => {
    const terms: QueryTerm[] = [
      {
        containedBy: { status: 'active' },
        column: jsonSchema.metadata,
        table: jsonSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toHaveProperty('sv')
  })
})

describe('encryptQuery batch - mixed term types', () => {
  it('should encrypt mixed batch of scalar and JSON terms', async () => {
    const terms: QueryTerm[] = [
      {
        value: 'test@example.com',
        column: users.email,
        table: users,
        queryType: 'equality',
      },
      {
        path: 'user.email',
        value: 'json@example.com',
        column: jsonSchema.metadata,
        table: jsonSchema,
      },
      {
        contains: { role: 'admin' },
        column: jsonSchema.metadata,
        table: jsonSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(3)
    // First term: scalar unique
    expect(result.data[0]).toHaveProperty('hm')
    // Second term: JSON path with selector
    expect(result.data[1]).toHaveProperty('s')
    // Third term: JSON containment with sv array
    expect(result.data[2]).toHaveProperty('sv')
  })
})

describe('encryptQuery batch - return type formatting', () => {
  it('should format as composite-literal', async () => {
    const terms: QueryTerm[] = [
      {
        value: 'test@example.com',
        column: users.email,
        table: users,
        queryType: 'equality',
        returnType: 'composite-literal',
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(typeof result.data[0]).toBe('string')
    expect(result.data[0]).toMatch(/^\(.*\)$/)
  })
})

describe('encryptQuery batch - readonly/as const support', () => {
  it('should accept readonly array (as const)', async () => {
    const terms = [
      {
        value: 'test@example.com',
        column: users.email,
        table: users,
        queryType: 'equality' as const,
      },
    ] as const

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
  })
})

describe('encryptQuery batch - auto-infer index type', () => {
  it('should auto-infer index type when not specified', async () => {
    const result = await protectClient.encryptQuery([
      { value: 'test@example.com', column: users.email, table: users },
      // No indexType - should auto-infer from column config
    ])

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    // Auto-inferred result should be a valid encrypted payload
    expect(result.data[0]).not.toBeNull()
    expect(typeof result.data[0]).toBe('object')
    expect(result.data[0]).toHaveProperty('c')
  })

  it('should use explicit index type when specified', async () => {
    const result = await protectClient.encryptQuery([
      {
        value: 'test@example.com',
        column: users.email,
        table: users,
        queryType: 'equality',
      },
    ])

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toHaveProperty('hm') // unique returns HMAC
  })

  it('should handle mixed batch with and without indexType', async () => {
    const result = await protectClient.encryptQuery([
      // Explicit indexType
      {
        value: 'explicit@example.com',
        column: users.email,
        table: users,
        queryType: 'equality',
      },
      // Auto-infer indexType
      { value: 'auto@example.com', column: users.email, table: users },
      // Another explicit indexType
      { value: 100, column: users.score, table: users, queryType: 'orderAndRange' },
    ])

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(3)
    // First term: explicit unique should have hm
    expect(result.data[0]).toHaveProperty('hm')
    // Second term: auto-inferred should be valid encrypted payload
    expect(result.data[1]).not.toBeNull()
    expect(typeof result.data[1]).toBe('object')
    expect(result.data[1]).toHaveProperty('c')
    // Third term: explicit ore should have valid encryption
    expect(result.data[2]).not.toBeNull()
  })
})



describe('encryptQuery single-value - auto-infer index type', () => {
  it('should auto-infer index type for single value when not specified', async () => {
    const result = await protectClient.encryptQuery('test@example.com', {
      column: users.email,
      table: users,
      // No indexType - should auto-infer from column config
    })

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    // Auto-inferred result should be a valid encrypted payload
    expect(result.data).not.toBeNull()
    expect(typeof result.data).toBe('object')
    expect(result.data).toHaveProperty('c')
  })

  it('should use explicit index type for single value when specified', async () => {
    const result = await protectClient.encryptQuery('test@example.com', {
      column: users.email,
      table: users,
      queryType: 'equality',
    })

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveProperty('hm') // unique returns HMAC
  })

  it('should handle null value with auto-infer', async () => {
    const result = await protectClient.encryptQuery(null, {
      column: users.email,
      table: users,
      // No indexType
    })

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toBeNull()
  })
})
