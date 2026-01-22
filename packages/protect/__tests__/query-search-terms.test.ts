import 'dotenv/config'
import { csColumn, csTable } from '@cipherstash/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { LockContext, type QuerySearchTerm, protect } from '../src'
import {
  expectHasHm,
  expectMatchIndex,
  expectOreIndex,
  parseCompositeLiteral,
} from './test-utils/query-terms'

const users = csTable('users', {
  email: csColumn('email').freeTextSearch().equality().orderAndRange(),
  score: csColumn('score').dataType('number').orderAndRange(),
})

// Schema with searchableJson for ste_vec tests
const jsonSchema = csTable('json_users', {
  metadata: csColumn('metadata').searchableJson(),
})

let protectClient: Awaited<ReturnType<typeof protect>>

beforeAll(async () => {
  protectClient = await protect({ schemas: [users, jsonSchema] })
})

describe('encryptQuery', () => {
  it('should encrypt query with unique index', async () => {
    const result = await protectClient.encryptQuery('test@example.com', {
      column: users.email,
      table: users,
      queryType: 'equality',
    })

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    // Unique index returns 'hm' (HMAC)
    expect(result.data).toHaveProperty('hm')
  })

  it('should encrypt query with ore index', async () => {
    const result = await protectClient.encryptQuery(100, {
      column: users.score,
      table: users,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    // ORE index uses ob (ore blocks)
    expectOreIndex(result.data)
  })

  it('should encrypt query with match index', async () => {
    const result = await protectClient.encryptQuery('test', {
      column: users.email,
      table: users,
      queryType: 'freeTextSearch',
    })

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    // Match index uses bf (bloom filter)
    expectMatchIndex(result.data)
  })

  it('should handle null value in encryptQuery', async () => {
    const result = await protectClient.encryptQuery(null, {
      column: users.email,
      table: users,
      queryType: 'equality',
    })

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    // Null should produce null output (passthrough behavior)
    expect(result.data).toBeNull()
  })
})

describe('createQuerySearchTerms', () => {
  it('should encrypt multiple terms with different index types', async () => {
    const terms: QuerySearchTerm[] = [
      {
        value: 'test@example.com',
        column: users.email,
        table: users,
        queryType: 'equality',
      },
      {
        value: 100,
        column: users.score,
        table: users,
        queryType: 'orderAndRange',
      },
    ]

    const result = await protectClient.createQuerySearchTerms(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(2)

    // Check first term (unique) has hm
    expect(result.data[0]).toHaveProperty('hm')

    // Check second term (ore) has ob
    const oreTerm = result.data[1] as { ob?: unknown[] }
    expectOreIndex(oreTerm)
  })

  it('should handle composite-literal return type', async () => {
    const terms: QuerySearchTerm[] = [
      {
        value: 'test@example.com',
        column: users.email,
        table: users,
        queryType: 'equality',
        returnType: 'composite-literal',
      },
    ]

    const result = await protectClient.createQuerySearchTerms(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    const term = result.data[0] as string
    expect(term).toMatch(/^\(.*\)$/)
    const parsed = parseCompositeLiteral(term) as { hm?: string }
    expectHasHm(parsed)
  })

  it('should handle escaped-composite-literal return type', async () => {
    const terms: QuerySearchTerm[] = [
      {
        value: 'test@example.com',
        column: users.email,
        table: users,
        queryType: 'equality',
        returnType: 'escaped-composite-literal',
      },
    ]

    const result = await protectClient.createQuerySearchTerms(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    const term = result.data[0] as string
    // escaped-composite-literal wraps in quotes
    expect(term).toMatch(/^".*"$/)
    const unescaped = JSON.parse(term) as string
    expect(unescaped).toMatch(/^\(.*\)$/)
    const parsed = parseCompositeLiteral(unescaped) as { hm?: string }
    expectHasHm(parsed)
  })

  it('should handle ste_vec index with default queryOp', async () => {
    const terms: QuerySearchTerm[] = [
      {
        // For ste_vec with default queryOp, value must be a JSON object
        // matching the structure expected for the ste_vec index
        value: { role: 'admin' },
        column: jsonSchema.metadata,
        table: jsonSchema,
        queryType: 'searchableJson',
        queryOp: 'default',
      },
    ]

    const result = await protectClient.createQuerySearchTerms(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    // ste_vec with default queryOp returns encrypted structure with index info
    expect(result.data[0]).toHaveProperty('i')
    expect(result.data[0]).toHaveProperty('v')
  })
})


