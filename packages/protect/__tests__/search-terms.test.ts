import 'dotenv/config'
import { csColumn, csTable } from '@cipherstash/schema'
import { describe, expect, it } from 'vitest'
import { type SearchTerm, protect } from '../src'

const users = csTable('users', {
  email: csColumn('email').freeTextSearch().equality().orderAndRange(),
  address: csColumn('address').freeTextSearch(),
})

// Schema with searchableJson for JSON tests
const jsonSchema = csTable('json_users', {
  metadata: csColumn('metadata').searchableJson(),
})

describe('create search terms', () => {
  it('should create search terms with default return type', async () => {
    const protectClient = await protect({ schemas: [users] })

    const searchTerms = [
      {
        value: 'hello',
        column: users.email,
        table: users,
      },
      {
        value: 'world',
        column: users.address,
        table: users,
      },
    ] as SearchTerm[]

    const searchTermsResult = await protectClient.createSearchTerms(searchTerms)

    if (searchTermsResult.failure) {
      throw new Error(`[protect]: ${searchTermsResult.failure.message}`)
    }

    expect(searchTermsResult.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          c: expect.any(String),
        }),
      ]),
    )
  }, 30000)

  it('should create search terms with composite-literal return type', async () => {
    const protectClient = await protect({ schemas: [users] })

    const searchTerms = [
      {
        value: 'hello',
        column: users.email,
        table: users,
        returnType: 'composite-literal',
      },
    ] as SearchTerm[]

    const searchTermsResult = await protectClient.createSearchTerms(searchTerms)

    if (searchTermsResult.failure) {
      throw new Error(`[protect]: ${searchTermsResult.failure.message}`)
    }

    const result = searchTermsResult.data[0] as string
    expect(result).toMatch(/^\(.*\)$/)
    expect(() => JSON.parse(result.slice(1, -1))).not.toThrow()
  }, 30000)

  it('should create search terms with escaped-composite-literal return type', async () => {
    const protectClient = await protect({ schemas: [users] })

    const searchTerms = [
      {
        value: 'hello',
        column: users.email,
        table: users,
        returnType: 'escaped-composite-literal',
      },
    ] as SearchTerm[]

    const searchTermsResult = await protectClient.createSearchTerms(searchTerms)

    if (searchTermsResult.failure) {
      throw new Error(`[protect]: ${searchTermsResult.failure.message}`)
    }

    const result = searchTermsResult.data[0] as string
    expect(result).toMatch(/^".*"$/)
    const unescaped = JSON.parse(result)
    expect(unescaped).toMatch(/^\(.*\)$/)
    expect(() => JSON.parse(unescaped.slice(1, -1))).not.toThrow()
  }, 30000)
})

describe('create search terms - JSON support', () => {
  it('should create JSON path search term via createSearchTerms', async () => {
    const protectClient = await protect({ schemas: [jsonSchema] })

    const searchTerms = [
      {
        path: 'user.email',
        value: 'test@example.com',
        column: jsonSchema.metadata,
        table: jsonSchema,
      },
    ] as SearchTerm[]

    const result = await protectClient.createSearchTerms(searchTerms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toHaveProperty('s')
    expect((result.data[0] as { s: string }).s).toBe('json_users/metadata/user/email')
  }, 30000)

  it('should create JSON containment search term via createSearchTerms', async () => {
    const protectClient = await protect({ schemas: [jsonSchema] })

    const searchTerms = [
      {
        value: { role: 'admin' },
        column: jsonSchema.metadata,
        table: jsonSchema,
        containmentType: 'contains',
      },
    ] as SearchTerm[]

    const result = await protectClient.createSearchTerms(searchTerms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toHaveProperty('sv')
    const svResult = result.data[0] as { sv: Array<{ s: string }> }
    expect(svResult.sv[0].s).toBe('json_users/metadata/role')
  }, 30000)

  it('should handle mixed simple and JSON search terms', async () => {
    const protectClient = await protect({ schemas: [users, jsonSchema] })

    const searchTerms = [
      // Simple value term
      {
        value: 'hello',
        column: users.email,
        table: users,
      },
      // JSON path term
      {
        path: 'user.name',
        value: 'John',
        column: jsonSchema.metadata,
        table: jsonSchema,
      },
      // JSON containment term
      {
        value: { active: true },
        column: jsonSchema.metadata,
        table: jsonSchema,
        containmentType: 'contains',
      },
    ] as SearchTerm[]

    const result = await protectClient.createSearchTerms(searchTerms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(3)

    // First: simple term has 'c' property
    expect(result.data[0]).toHaveProperty('c')

    // Second: JSON path term has 's' property
    expect(result.data[1]).toHaveProperty('s')
    expect((result.data[1] as { s: string }).s).toBe('json_users/metadata/user/name')

    // Third: JSON containment term has 'sv' property
    expect(result.data[2]).toHaveProperty('sv')
  }, 30000)
})
