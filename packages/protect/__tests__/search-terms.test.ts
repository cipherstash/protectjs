import 'dotenv/config'
import { csColumn, csTable } from '@cipherstash/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { LockContext, type SearchTerm, protect } from '../src'
import {
  expectMatchIndex,
  expectJsonPathWithValue,
  expectJsonPathSelectorOnly,
  expectSteVecArray,
  expectSteVecSelector,
  expectCompositeLiteralWithEncryption,
  parseCompositeLiteral,
} from './test-utils/query-terms'

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
    expectCompositeLiteralWithEncryption(
      result,
      (parsed) => expectMatchIndex(parsed as { bf?: unknown[] })
    )
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
    expectCompositeLiteralWithEncryption(
      unescaped,
      (parsed) => expectMatchIndex(parsed as { bf?: unknown[] })
    )
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
    expectJsonPathWithValue(result.data[0] as Record<string, unknown>)
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
    expectSteVecArray(result.data[0] as { sv: Array<Record<string, unknown>> })
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
    expectSteVecSelector(result.data[1] as { s?: string })

    // Third: JSON containment term has 'sv' property
    expect(result.data[2]).toHaveProperty('sv')
  }, 30000)
})

// Comprehensive JSON search tests migrated from json-search-terms.test.ts
// These test the unified createSearchTerms API with JSON path and containment queries

const jsonSearchSchema = csTable('test_json_search', {
  metadata: csColumn('metadata').searchableJson(),
  config: csColumn('config').searchableJson(),
})

// Schema without searchableJson for error testing
const schemaWithoutSteVec = csTable('test_no_ste_vec', {
  data: csColumn('data').dataType('json'),
})

describe('Selector prefix resolution', () => {
  it('should use table/column prefix in selector for searchableJson columns', async () => {
    const protectClient = await protect({ schemas: [jsonSearchSchema] })

    const terms = [
      {
        path: 'user.email',
        value: 'test@example.com',
        column: jsonSearchSchema.metadata,
        table: jsonSearchSchema,
      },
    ] as SearchTerm[]

    const result = await protectClient.createSearchTerms(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    // Verify selector is encrypted
    expectSteVecSelector(result.data[0] as { s?: string })
  }, 30000)
})

describe('create search terms - JSON comprehensive', () => {
  let protectClient: Awaited<ReturnType<typeof protect>>

  beforeAll(async () => {
    protectClient = await protect({
      schemas: [jsonSearchSchema, schemaWithoutSteVec],
    })
  })

  describe('Path queries', () => {
    it('should create search term with path as string', async () => {
      const terms = [
        {
          path: 'user.email',
          value: 'test@example.com',
          column: jsonSearchSchema.metadata,
          table: jsonSearchSchema,
        },
      ] as SearchTerm[]

      const result = await protectClient.createSearchTerms(terms)

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toHaveLength(1)
      expectJsonPathWithValue(result.data[0] as Record<string, unknown>)
    }, 30000)

    it('should create search term with path as array', async () => {
      const terms = [
        {
          path: ['user', 'email'],
          value: 'test@example.com',
          column: jsonSearchSchema.metadata,
          table: jsonSearchSchema,
        },
      ] as SearchTerm[]

      const result = await protectClient.createSearchTerms(terms)

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toHaveLength(1)
      expect(result.data[0]).toHaveProperty('s')
      expect((result.data[0] as any).s).toMatch(/^[0-9a-f]+$/)
    }, 30000)

    it('should create search term with deep path', async () => {
      const terms = [
        {
          path: 'user.settings.preferences.theme',
          value: 'dark',
          column: jsonSearchSchema.metadata,
          table: jsonSearchSchema,
        },
      ] as SearchTerm[]

      const result = await protectClient.createSearchTerms(terms)

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toHaveLength(1)
      expectSteVecSelector(result.data[0] as { s?: string })
    }, 30000)

    it('should create path-only search term (no value comparison)', async () => {
      const terms = [
        {
          path: 'user.email',
          column: jsonSearchSchema.metadata,
          table: jsonSearchSchema,
        },
      ] as SearchTerm[]

      const result = await protectClient.createSearchTerms(terms)

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toHaveLength(1)
      expectJsonPathSelectorOnly(result.data[0] as Record<string, unknown>)
    }, 30000)

    it('should handle single-segment path', async () => {
      const terms = [
        {
          path: 'status',
          value: 'active',
          column: jsonSearchSchema.metadata,
          table: jsonSearchSchema,
        },
      ] as SearchTerm[]

      const result = await protectClient.createSearchTerms(terms)

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toHaveLength(1)
      expectSteVecSelector(result.data[0] as { s?: string })
    }, 30000)
  })

  describe('Containment queries', () => {
    it('should create containment query for simple object', async () => {
      const terms = [
        {
          value: { role: 'admin' },
          column: jsonSearchSchema.metadata,
          table: jsonSearchSchema,
          containmentType: 'contains',
        },
      ] as SearchTerm[]

      const result = await protectClient.createSearchTerms(terms)

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toHaveLength(1)
      // Containment results have 'sv' array for wrapped values
      expect(result.data[0]).toHaveProperty('sv')
      const svResult = result.data[0] as { sv: Array<{ s: any }> }
      expect(Array.isArray(svResult.sv)).toBe(true)
      expect(svResult.sv).toHaveLength(1)
      expect(svResult.sv[0]).toHaveProperty('s')
      expect(svResult.sv[0].s).toMatch(/^[0-9a-f]+$/)
    }, 30000)

    it('should create containment query for nested object', async () => {
      const terms = [
        {
          value: { user: { role: 'admin' } },
          column: jsonSearchSchema.metadata,
          table: jsonSearchSchema,
          containmentType: 'contains',
        },
      ] as SearchTerm[]

      const result = await protectClient.createSearchTerms(terms)

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toHaveLength(1)
      expect(result.data[0]).toHaveProperty('sv')
      const svResult = result.data[0] as { sv: Array<{ s: any }> }
      expect(svResult.sv).toHaveLength(1)
      expect(svResult.sv[0].s).toMatch(/^[0-9a-f]+$/)
    }, 30000)

    it('should create containment query for multiple keys', async () => {
      const terms = [
        {
          value: { role: 'admin', status: 'active' },
          column: jsonSearchSchema.metadata,
          table: jsonSearchSchema,
          containmentType: 'contains',
        },
      ] as SearchTerm[]

      const result = await protectClient.createSearchTerms(terms)

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toHaveLength(1)
      expect(result.data[0]).toHaveProperty('sv')
      const svResult = result.data[0] as { sv: Array<{ s: any }> }
      // Two keys = two entries in sv array
      expect(svResult.sv).toHaveLength(2)

      expect(svResult.sv[0].s).toMatch(/^[0-9a-f]+$/)
      expect(svResult.sv[1].s).toMatch(/^[0-9a-f]+$/)
    }, 30000)

    it('should create containment query with contained_by type', async () => {
      const terms = [
        {
          value: { role: 'admin' },
          column: jsonSearchSchema.metadata,
          table: jsonSearchSchema,
          containmentType: 'contained_by',
        },
      ] as SearchTerm[]

      const result = await protectClient.createSearchTerms(terms)

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toHaveLength(1)
      expect(result.data[0]).toHaveProperty('sv')
    }, 30000)

    it('should create containment query for array value', async () => {
      const terms = [
        {
          value: { tags: ['premium', 'verified'] },
          column: jsonSearchSchema.metadata,
          table: jsonSearchSchema,
          containmentType: 'contains',
        },
      ] as SearchTerm[]

      const result = await protectClient.createSearchTerms(terms)

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toHaveLength(1)
      expect(result.data[0]).toHaveProperty('sv')
      const svResult = result.data[0] as { sv: Array<{ s: any }> }
      // Array is a leaf value, so single entry
      expect(svResult.sv).toHaveLength(1)
      expect(svResult.sv[0].s).toMatch(/^[0-9a-f]+$/)
    }, 30000)
  })

  describe('Bulk operations', () => {
    it('should handle multiple path queries in single call', async () => {
      const terms = [
        {
          path: 'user.email',
          value: 'test@example.com',
          column: jsonSearchSchema.metadata,
          table: jsonSearchSchema,
        },
        {
          path: 'user.name',
          value: 'John Doe',
          column: jsonSearchSchema.metadata,
          table: jsonSearchSchema,
        },
        {
          path: 'status',
          value: 'active',
          column: jsonSearchSchema.metadata,
          table: jsonSearchSchema,
        },
      ] as SearchTerm[]

      const result = await protectClient.createSearchTerms(terms)

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toHaveLength(3)
      expectSteVecSelector(result.data[0] as { s?: string })
      expectSteVecSelector(result.data[1] as { s?: string })
      expectSteVecSelector(result.data[2] as { s?: string })
    }, 30000)

    it('should handle multiple containment queries in single call', async () => {
      const terms = [
        {
          value: { role: 'admin' },
          column: jsonSearchSchema.metadata,
          table: jsonSearchSchema,
          containmentType: 'contains',
        },
        {
          value: { enabled: true },
          column: jsonSearchSchema.config,
          table: jsonSearchSchema,
          containmentType: 'contains',
        },
      ] as SearchTerm[]

      const result = await protectClient.createSearchTerms(terms)

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toHaveLength(2)
      expectSteVecArray(result.data[0] as { sv: Array<Record<string, unknown>> })
      expectSteVecArray(result.data[1] as { sv: Array<Record<string, unknown>> })
    }, 30000)

    it('should handle mixed path and containment queries', async () => {
      const terms = [
        {
          path: 'user.email',
          value: 'test@example.com',
          column: jsonSearchSchema.metadata,
          table: jsonSearchSchema,
        },
        {
          value: { role: 'admin' },
          column: jsonSearchSchema.metadata,
          table: jsonSearchSchema,
          containmentType: 'contains',
        },
        {
          path: 'settings.enabled',
          column: jsonSearchSchema.config,
          table: jsonSearchSchema,
        },
      ] as SearchTerm[]

      const result = await protectClient.createSearchTerms(terms)

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toHaveLength(3)

      // First: path query with value
      expectJsonPathWithValue(result.data[0] as Record<string, unknown>)

      // Second: containment query
      expectSteVecArray(result.data[1] as { sv: Array<Record<string, unknown>> })

      // Third: path-only query
      expectJsonPathSelectorOnly(result.data[2] as Record<string, unknown>)
    }, 30000)

    it('should handle queries across multiple columns', async () => {
      const terms = [
        {
          path: 'user.id',
          value: 123,
          column: jsonSearchSchema.metadata,
          table: jsonSearchSchema,
        },
        {
          path: 'feature.enabled',
          value: true,
          column: jsonSearchSchema.config,
          table: jsonSearchSchema,
        },
      ] as SearchTerm[]

      const result = await protectClient.createSearchTerms(terms)

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toHaveLength(2)
      expectSteVecSelector(result.data[0] as { s?: string })
      expectSteVecSelector(result.data[1] as { s?: string })
    }, 30000)
  })

  describe('Edge cases', () => {
    it('should handle empty terms array', async () => {
      const terms: SearchTerm[] = []

      const result = await protectClient.createSearchTerms(terms)

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toHaveLength(0)
    }, 30000)

    it('should handle very deep nesting (10+ levels)', async () => {
      const terms = [
        {
          path: 'a.b.c.d.e.f.g.h.i.j.k',
          value: 'deep_value',
          column: jsonSearchSchema.metadata,
          table: jsonSearchSchema,
        },
      ] as SearchTerm[]

      const result = await protectClient.createSearchTerms(terms)

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toHaveLength(1)
      expectSteVecSelector(result.data[0] as { s?: string })
    }, 30000)

    it('should handle unicode in paths', async () => {
      const terms = [
        {
          path: ['用户', '电子邮件'],
          value: 'test@example.com',
          column: jsonSearchSchema.metadata,
          table: jsonSearchSchema,
        },
      ] as SearchTerm[]

      const result = await protectClient.createSearchTerms(terms)

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toHaveLength(1)
      expectSteVecSelector(result.data[0] as { s?: string })
    }, 30000)

    it('should handle unicode in values', async () => {
      const terms = [
        {
          path: 'message',
          value: '你好世界 🌍',
          column: jsonSearchSchema.metadata,
          table: jsonSearchSchema,
        },
      ] as SearchTerm[]

      const result = await protectClient.createSearchTerms(terms)

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toHaveLength(1)
      expectJsonPathWithValue(result.data[0] as Record<string, unknown>)
    }, 30000)

    it('should handle special characters in keys', async () => {
      const terms = [
        {
          value: { 'key-with-dash': 'value', key_with_underscore: 'value2' },
          column: jsonSearchSchema.metadata,
          table: jsonSearchSchema,
          containmentType: 'contains',
        },
      ] as SearchTerm[]

      const result = await protectClient.createSearchTerms(terms)

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toHaveLength(1)
      expect(result.data[0]).toHaveProperty('sv')
      const svResult = result.data[0] as { sv: Array<{ s: any }> }
      expect(svResult.sv).toHaveLength(2)

      expect(svResult.sv[0].s).toMatch(/^[0-9a-f]+$/)
      expect(svResult.sv[1].s).toMatch(/^[0-9a-f]+$/)
    }, 30000)

    it('should handle null values in containment queries', async () => {
      const terms = [
        {
          value: { status: null },
          column: jsonSearchSchema.metadata,
          table: jsonSearchSchema,
          containmentType: 'contains',
        },
      ] as SearchTerm[]

      const result = await protectClient.createSearchTerms(terms)

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toHaveLength(1)
      expect(result.data[0]).toHaveProperty('sv')
    }, 30000)

    it('should handle boolean values', async () => {
      const terms = [
        {
          path: 'enabled',
          value: true,
          column: jsonSearchSchema.metadata,
          table: jsonSearchSchema,
        },
        {
          path: 'disabled',
          value: false,
          column: jsonSearchSchema.metadata,
          table: jsonSearchSchema,
        },
      ] as SearchTerm[]

      const result = await protectClient.createSearchTerms(terms)

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toHaveLength(2)
      expectJsonPathWithValue(result.data[0] as Record<string, unknown>)
      expectJsonPathWithValue(result.data[1] as Record<string, unknown>)
    }, 30000)

    it('should handle numeric values', async () => {
      const terms = [
        {
          path: 'count',
          value: 42,
          column: jsonSearchSchema.metadata,
          table: jsonSearchSchema,
        },
        {
          path: 'price',
          value: 99.99,
          column: jsonSearchSchema.metadata,
          table: jsonSearchSchema,
        },
        {
          path: 'negative',
          value: -100,
          column: jsonSearchSchema.metadata,
          table: jsonSearchSchema,
        },
      ] as SearchTerm[]

      const result = await protectClient.createSearchTerms(terms)

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toHaveLength(3)
      for (const item of result.data) {
        expectJsonPathWithValue(item as Record<string, unknown>)
      }
    }, 30000)

    it('should handle large containment objects', async () => {
      const largeObject: Record<string, unknown> = {}
      for (let i = 0; i < 50; i++) {
        largeObject[`key${i}`] = `value${i}`
      }

      const terms = [
        {
          value: largeObject,
          column: jsonSearchSchema.metadata,
          table: jsonSearchSchema,
          containmentType: 'contains',
        },
      ] as SearchTerm[]

      const result = await protectClient.createSearchTerms(terms)

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toHaveLength(1)
      expectSteVecArray(result.data[0] as { sv: Array<Record<string, unknown>> }, 50)
    }, 30000)
  })

  describe('Error handling', () => {
    it('should throw error for column without ste_vec index configured', async () => {
      const terms = [
        {
          path: 'user.email',
          value: 'test@example.com',
          column: schemaWithoutSteVec.data,
          table: schemaWithoutSteVec,
        },
      ] as SearchTerm[]

      const result = await protectClient.createSearchTerms(terms)

      expect(result.failure).toBeDefined()
      expect(result.failure?.message).toContain('does not have ste_vec index')
      expect(result.failure?.message).toContain('searchableJson()')
    }, 30000)

    it('should throw error for containment query on column without ste_vec', async () => {
      const terms = [
        {
          value: { role: 'admin' },
          column: schemaWithoutSteVec.data,
          table: schemaWithoutSteVec,
          containmentType: 'contains',
        },
      ] as SearchTerm[]

      const result = await protectClient.createSearchTerms(terms)

      expect(result.failure).toBeDefined()
      expect(result.failure?.message).toContain('does not have ste_vec index')
    }, 30000)
  })

  describe('Selector generation verification', () => {
    it('should generate correct selector format for path query', async () => {
      const terms = [
        {
          path: 'user.profile.name',
          value: 'John',
          column: jsonSearchSchema.metadata,
          table: jsonSearchSchema,
        },
      ] as SearchTerm[]

      const result = await protectClient.createSearchTerms(terms)

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      // Verify selector is encrypted
      const selector = (result.data[0] as any).s
      expect(selector).toMatch(/^[0-9a-f]+$/)
    }, 30000)

    it('should generate correct selector format for containment with nested object', async () => {
      const terms = [
        {
          value: {
            user: {
              profile: {
                role: 'admin',
              },
            },
          },
          column: jsonSearchSchema.config,
          table: jsonSearchSchema,
          containmentType: 'contains',
        },
      ] as SearchTerm[]

      const result = await protectClient.createSearchTerms(terms)

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data[0]).toHaveProperty('sv')
      const svResult = result.data[0] as { sv: Array<{ s: string }> }
      expect(svResult.sv).toHaveLength(1)

      // Deep path flattened to leaf
      const selector = svResult.sv[0].s
      expect(selector).toMatch(/^[0-9a-f]+$/)
    }, 30000)

    it('should verify encrypted content structure in path query', async () => {
      const terms = [
        {
          path: 'key',
          value: 'value',
          column: jsonSearchSchema.metadata,
          table: jsonSearchSchema,
        },
      ] as SearchTerm[]

      const result = await protectClient.createSearchTerms(terms)

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      const encrypted = result.data[0]
      expectJsonPathWithValue(encrypted as Record<string, unknown>)
    }, 30000)

    it('should verify encrypted content structure in containment query', async () => {
      const terms = [
        {
          value: { key: 'value' },
          column: jsonSearchSchema.metadata,
          table: jsonSearchSchema,
          containmentType: 'contains',
        },
      ] as SearchTerm[]

      const result = await protectClient.createSearchTerms(terms)

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      const encrypted = result.data[0]
      expectSteVecArray(encrypted as { sv: Array<Record<string, unknown>> })
    }, 30000)
  })


})
