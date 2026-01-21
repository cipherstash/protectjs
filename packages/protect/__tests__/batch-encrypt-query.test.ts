import 'dotenv/config'
import { csColumn, csTable } from '@cipherstash/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { protect, type QueryTerm } from '../src'

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
  it('should encrypt batch of scalar terms', async () => {
    const terms: QueryTerm[] = [
      { value: 'test@example.com', column: users.email, table: users, indexType: 'unique' },
      { value: 100, column: users.score, table: users, indexType: 'ore' },
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
      { path: 'user.email', value: 'test@example.com', column: jsonSchema.metadata, table: jsonSchema },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toHaveProperty('s', 'json_users/metadata/user/email')
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
    expect(result.data[0]).toEqual({ s: 'json_users/metadata/user/role' })
  })
})

describe('encryptQuery batch - JSON containment queries', () => {
  it('should encrypt JSON contains query', async () => {
    const terms: QueryTerm[] = [
      { contains: { role: 'admin' }, column: jsonSchema.metadata, table: jsonSchema },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toHaveProperty('sv')
    const sv = (result.data[0] as any).sv
    expect(sv).toHaveLength(1)
    expect(sv[0]).toHaveProperty('s', 'json_users/metadata/role')
  })

  it('should encrypt JSON containedBy query', async () => {
    const terms: QueryTerm[] = [
      { containedBy: { status: 'active' }, column: jsonSchema.metadata, table: jsonSchema },
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
      { value: 'test@example.com', column: users.email, table: users, indexType: 'unique' },
      { path: 'user.email', value: 'json@example.com', column: jsonSchema.metadata, table: jsonSchema },
      { contains: { role: 'admin' }, column: jsonSchema.metadata, table: jsonSchema },
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
      { value: 'test@example.com', column: users.email, table: users, indexType: 'unique', returnType: 'composite-literal' },
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
      { value: 'test@example.com', column: users.email, table: users, indexType: 'unique' as const },
    ] as const

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
  })
})
