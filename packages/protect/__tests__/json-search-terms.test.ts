import 'dotenv/config'
import { csColumn, csTable } from '@cipherstash/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { LockContext, protect } from '../src'
import { JsonSearchTermsOperation } from '../src/ffi/operations/json-search-terms'
import type { JsonSearchTerm } from '../src/types'

const schema = csTable('test_json_search', {
  metadata: csColumn('metadata').searchableJson(),
  config: csColumn('config').searchableJson(),
})

// Schema without searchableJson for error testing
const schemaWithoutSteVec = csTable('test_no_ste_vec', {
  data: csColumn('data').dataType('json'),
})

let protectClient: Awaited<ReturnType<typeof protect>>

beforeAll(async () => {
  protectClient = await protect({
    schemas: [schema, schemaWithoutSteVec],
  })
})

describe('JSON search terms - Path queries', () => {
  it('should create search term with path as string', async () => {
    const terms: JsonSearchTerm[] = [
      {
        path: 'user.email',
        value: 'test@example.com',
        column: schema.metadata,
        table: schema,
      },
    ]

    const operation = new JsonSearchTermsOperation(
      (protectClient as unknown as { client: unknown }).client as never,
      terms,
    )

    const result = await operation.execute()

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toHaveProperty('s')
    // Verify selector format: prefix/path/segments
    expect(result.data[0].s).toBe('test_json_search/metadata/user/email')
    // Verify there's encrypted content (not just the selector)
    expect(Object.keys(result.data[0]).length).toBeGreaterThan(1)
  }, 30000)

  it('should create search term with path as array', async () => {
    const terms: JsonSearchTerm[] = [
      {
        path: ['user', 'email'],
        value: 'test@example.com',
        column: schema.metadata,
        table: schema,
      },
    ]

    const operation = new JsonSearchTermsOperation(
      (protectClient as unknown as { client: unknown }).client as never,
      terms,
    )

    const result = await operation.execute()

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toHaveProperty('s')
    expect(result.data[0].s).toBe('test_json_search/metadata/user/email')
  }, 30000)

  it('should create search term with deep path', async () => {
    const terms: JsonSearchTerm[] = [
      {
        path: 'user.settings.preferences.theme',
        value: 'dark',
        column: schema.metadata,
        table: schema,
      },
    ]

    const operation = new JsonSearchTermsOperation(
      (protectClient as unknown as { client: unknown }).client as never,
      terms,
    )

    const result = await operation.execute()

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expect(result.data[0].s).toBe(
      'test_json_search/metadata/user/settings/preferences/theme',
    )
  }, 30000)

  it('should create path-only search term (no value comparison)', async () => {
    const terms: JsonSearchTerm[] = [
      {
        path: 'user.email',
        column: schema.metadata,
        table: schema,
      },
    ]

    const operation = new JsonSearchTermsOperation(
      (protectClient as unknown as { client: unknown }).client as never,
      terms,
    )

    const result = await operation.execute()

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    // Path-only returns selector without encrypted content
    expect(result.data[0]).toHaveProperty('s')
    expect(result.data[0].s).toBe('test_json_search/metadata/user/email')
    // No encrypted content for path-only queries
    expect(result.data[0]).not.toHaveProperty('c')
  }, 30000)

  it('should handle single-segment path', async () => {
    const terms: JsonSearchTerm[] = [
      {
        path: 'status',
        value: 'active',
        column: schema.metadata,
        table: schema,
      },
    ]

    const operation = new JsonSearchTermsOperation(
      (protectClient as unknown as { client: unknown }).client as never,
      terms,
    )

    const result = await operation.execute()

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expect(result.data[0].s).toBe('test_json_search/metadata/status')
  }, 30000)
})

describe('JSON search terms - Containment queries', () => {
  it('should create containment query for simple object', async () => {
    const terms: JsonSearchTerm[] = [
      {
        value: { role: 'admin' },
        column: schema.metadata,
        table: schema,
        containmentType: 'contains',
      },
    ]

    const operation = new JsonSearchTermsOperation(
      (protectClient as unknown as { client: unknown }).client as never,
      terms,
    )

    const result = await operation.execute()

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    // Containment results have 'sv' array for wrapped values
    expect(result.data[0]).toHaveProperty('sv')
    expect(Array.isArray(result.data[0].sv)).toBe(true)
    expect(result.data[0].sv).toHaveLength(1)
    expect(result.data[0].sv![0]).toHaveProperty('s')
    expect(result.data[0].sv![0].s).toBe('test_json_search/metadata/role')
  }, 30000)

  it('should create containment query for nested object', async () => {
    const terms: JsonSearchTerm[] = [
      {
        value: { user: { role: 'admin' } },
        column: schema.metadata,
        table: schema,
        containmentType: 'contains',
      },
    ]

    const operation = new JsonSearchTermsOperation(
      (protectClient as unknown as { client: unknown }).client as never,
      terms,
    )

    const result = await operation.execute()

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toHaveProperty('sv')
    expect(result.data[0].sv).toHaveLength(1)
    expect(result.data[0].sv![0].s).toBe('test_json_search/metadata/user/role')
  }, 30000)

  it('should create containment query for multiple keys', async () => {
    const terms: JsonSearchTerm[] = [
      {
        value: { role: 'admin', status: 'active' },
        column: schema.metadata,
        table: schema,
        containmentType: 'contains',
      },
    ]

    const operation = new JsonSearchTermsOperation(
      (protectClient as unknown as { client: unknown }).client as never,
      terms,
    )

    const result = await operation.execute()

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toHaveProperty('sv')
    // Two keys = two entries in sv array
    expect(result.data[0].sv).toHaveLength(2)

    const selectors = result.data[0].sv!.map((entry) => entry.s)
    expect(selectors).toContain('test_json_search/metadata/role')
    expect(selectors).toContain('test_json_search/metadata/status')
  }, 30000)

  it('should create containment query with contained_by type', async () => {
    const terms: JsonSearchTerm[] = [
      {
        value: { role: 'admin' },
        column: schema.metadata,
        table: schema,
        containmentType: 'contained_by',
      },
    ]

    const operation = new JsonSearchTermsOperation(
      (protectClient as unknown as { client: unknown }).client as never,
      terms,
    )

    const result = await operation.execute()

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toHaveProperty('sv')
  }, 30000)

  it('should create containment query for array value', async () => {
    const terms: JsonSearchTerm[] = [
      {
        value: { tags: ['premium', 'verified'] },
        column: schema.metadata,
        table: schema,
        containmentType: 'contains',
      },
    ]

    const operation = new JsonSearchTermsOperation(
      (protectClient as unknown as { client: unknown }).client as never,
      terms,
    )

    const result = await operation.execute()

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toHaveProperty('sv')
    // Array is a leaf value, so single entry
    expect(result.data[0].sv).toHaveLength(1)
    expect(result.data[0].sv![0].s).toBe('test_json_search/metadata/tags')
  }, 30000)
})

describe('JSON search terms - Bulk operations', () => {
  it('should handle multiple path queries in single call', async () => {
    const terms: JsonSearchTerm[] = [
      {
        path: 'user.email',
        value: 'test@example.com',
        column: schema.metadata,
        table: schema,
      },
      {
        path: 'user.name',
        value: 'John Doe',
        column: schema.metadata,
        table: schema,
      },
      {
        path: 'status',
        value: 'active',
        column: schema.metadata,
        table: schema,
      },
    ]

    const operation = new JsonSearchTermsOperation(
      (protectClient as unknown as { client: unknown }).client as never,
      terms,
    )

    const result = await operation.execute()

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(3)
    expect(result.data[0].s).toBe('test_json_search/metadata/user/email')
    expect(result.data[1].s).toBe('test_json_search/metadata/user/name')
    expect(result.data[2].s).toBe('test_json_search/metadata/status')
  }, 30000)

  it('should handle multiple containment queries in single call', async () => {
    const terms: JsonSearchTerm[] = [
      {
        value: { role: 'admin' },
        column: schema.metadata,
        table: schema,
        containmentType: 'contains',
      },
      {
        value: { enabled: true },
        column: schema.config,
        table: schema,
        containmentType: 'contains',
      },
    ]

    const operation = new JsonSearchTermsOperation(
      (protectClient as unknown as { client: unknown }).client as never,
      terms,
    )

    const result = await operation.execute()

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(2)
    expect(result.data[0]).toHaveProperty('sv')
    expect(result.data[0].sv![0].s).toBe('test_json_search/metadata/role')
    expect(result.data[1]).toHaveProperty('sv')
    expect(result.data[1].sv![0].s).toBe('test_json_search/config/enabled')
  }, 30000)

  it('should handle mixed path and containment queries', async () => {
    const terms: JsonSearchTerm[] = [
      {
        path: 'user.email',
        value: 'test@example.com',
        column: schema.metadata,
        table: schema,
      },
      {
        value: { role: 'admin' },
        column: schema.metadata,
        table: schema,
        containmentType: 'contains',
      },
      {
        path: 'settings.enabled',
        column: schema.config,
        table: schema,
      },
    ]

    const operation = new JsonSearchTermsOperation(
      (protectClient as unknown as { client: unknown }).client as never,
      terms,
    )

    const result = await operation.execute()

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(3)

    // First: path query with value
    expect(result.data[0]).toHaveProperty('s')
    expect(result.data[0].s).toBe('test_json_search/metadata/user/email')
    // Verify there's encrypted content (more than just selector)
    expect(Object.keys(result.data[0]).length).toBeGreaterThan(1)

    // Second: containment query
    expect(result.data[1]).toHaveProperty('sv')

    // Third: path-only query
    expect(result.data[2]).toHaveProperty('s')
    expect(result.data[2]).not.toHaveProperty('c')
  }, 30000)

  it('should handle queries across multiple columns', async () => {
    const terms: JsonSearchTerm[] = [
      {
        path: 'user.id',
        value: 123,
        column: schema.metadata,
        table: schema,
      },
      {
        path: 'feature.enabled',
        value: true,
        column: schema.config,
        table: schema,
      },
    ]

    const operation = new JsonSearchTermsOperation(
      (protectClient as unknown as { client: unknown }).client as never,
      terms,
    )

    const result = await operation.execute()

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(2)
    expect(result.data[0].s).toBe('test_json_search/metadata/user/id')
    expect(result.data[1].s).toBe('test_json_search/config/feature/enabled')
  }, 30000)
})

describe('JSON search terms - Lock context integration', () => {
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

    const terms: JsonSearchTerm[] = [
      {
        path: 'user.email',
        value: 'test@example.com',
        column: schema.metadata,
        table: schema,
      },
    ]

    const operation = new JsonSearchTermsOperation(
      (protectClient as unknown as { client: unknown }).client as never,
      terms,
    )

    const result = await operation.withLockContext(lockContext.data).execute()

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toHaveProperty('s')
    expect(result.data[0]).toHaveProperty('c')
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

    const terms: JsonSearchTerm[] = [
      {
        value: { role: 'admin' },
        column: schema.metadata,
        table: schema,
        containmentType: 'contains',
      },
    ]

    const operation = new JsonSearchTermsOperation(
      (protectClient as unknown as { client: unknown }).client as never,
      terms,
    )

    const result = await operation.withLockContext(lockContext.data).execute()

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toHaveProperty('sv')
  }, 30000)

  it('should create bulk operations with lock context', async () => {
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

    const terms: JsonSearchTerm[] = [
      {
        path: 'user.email',
        value: 'test@example.com',
        column: schema.metadata,
        table: schema,
      },
      {
        value: { role: 'admin' },
        column: schema.metadata,
        table: schema,
        containmentType: 'contains',
      },
    ]

    const operation = new JsonSearchTermsOperation(
      (protectClient as unknown as { client: unknown }).client as never,
      terms,
    )

    const result = await operation.withLockContext(lockContext.data).execute()

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(2)
  }, 30000)
})

describe('JSON search terms - Edge cases', () => {
  it('should handle empty terms array', async () => {
    const terms: JsonSearchTerm[] = []

    const operation = new JsonSearchTermsOperation(
      (protectClient as unknown as { client: unknown }).client as never,
      terms,
    )

    const result = await operation.execute()

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(0)
  }, 30000)

  it('should handle very deep nesting (10+ levels)', async () => {
    const terms: JsonSearchTerm[] = [
      {
        path: 'a.b.c.d.e.f.g.h.i.j.k',
        value: 'deep_value',
        column: schema.metadata,
        table: schema,
      },
    ]

    const operation = new JsonSearchTermsOperation(
      (protectClient as unknown as { client: unknown }).client as never,
      terms,
    )

    const result = await operation.execute()

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expect(result.data[0].s).toBe(
      'test_json_search/metadata/a/b/c/d/e/f/g/h/i/j/k',
    )
  }, 30000)

  it('should handle unicode in paths', async () => {
    const terms: JsonSearchTerm[] = [
      {
        path: ['用户', '电子邮件'],
        value: 'test@example.com',
        column: schema.metadata,
        table: schema,
      },
    ]

    const operation = new JsonSearchTermsOperation(
      (protectClient as unknown as { client: unknown }).client as never,
      terms,
    )

    const result = await operation.execute()

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expect(result.data[0].s).toBe('test_json_search/metadata/用户/电子邮件')
  }, 30000)

  it('should handle unicode in values', async () => {
    const terms: JsonSearchTerm[] = [
      {
        path: 'message',
        value: '你好世界 🌍',
        column: schema.metadata,
        table: schema,
      },
    ]

    const operation = new JsonSearchTermsOperation(
      (protectClient as unknown as { client: unknown }).client as never,
      terms,
    )

    const result = await operation.execute()

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toHaveProperty('s')
    // Verify there's encrypted content
    expect(Object.keys(result.data[0]).length).toBeGreaterThan(1)
  }, 30000)

  it('should handle special characters in keys', async () => {
    const terms: JsonSearchTerm[] = [
      {
        value: { 'key-with-dash': 'value', key_with_underscore: 'value2' },
        column: schema.metadata,
        table: schema,
        containmentType: 'contains',
      },
    ]

    const operation = new JsonSearchTermsOperation(
      (protectClient as unknown as { client: unknown }).client as never,
      terms,
    )

    const result = await operation.execute()

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toHaveProperty('sv')
    expect(result.data[0].sv).toHaveLength(2)

    const selectors = result.data[0].sv!.map((entry) => entry.s)
    expect(selectors).toContain('test_json_search/metadata/key-with-dash')
    expect(selectors).toContain('test_json_search/metadata/key_with_underscore')
  }, 30000)

  it('should handle null values in containment queries', async () => {
    const terms: JsonSearchTerm[] = [
      {
        value: { status: null },
        column: schema.metadata,
        table: schema,
        containmentType: 'contains',
      },
    ]

    const operation = new JsonSearchTermsOperation(
      (protectClient as unknown as { client: unknown }).client as never,
      terms,
    )

    const result = await operation.execute()

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toHaveProperty('sv')
  }, 30000)

  it('should handle boolean values', async () => {
    const terms: JsonSearchTerm[] = [
      {
        path: 'enabled',
        value: true,
        column: schema.metadata,
        table: schema,
      },
      {
        path: 'disabled',
        value: false,
        column: schema.metadata,
        table: schema,
      },
    ]

    const operation = new JsonSearchTermsOperation(
      (protectClient as unknown as { client: unknown }).client as never,
      terms,
    )

    const result = await operation.execute()

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(2)
    // Both should have selector and encrypted content
    expect(result.data[0]).toHaveProperty('s')
    expect(result.data[1]).toHaveProperty('s')
    expect(Object.keys(result.data[0]).length).toBeGreaterThan(1)
    expect(Object.keys(result.data[1]).length).toBeGreaterThan(1)
  }, 30000)

  it('should handle numeric values', async () => {
    const terms: JsonSearchTerm[] = [
      {
        path: 'count',
        value: 42,
        column: schema.metadata,
        table: schema,
      },
      {
        path: 'price',
        value: 99.99,
        column: schema.metadata,
        table: schema,
      },
      {
        path: 'negative',
        value: -100,
        column: schema.metadata,
        table: schema,
      },
    ]

    const operation = new JsonSearchTermsOperation(
      (protectClient as unknown as { client: unknown }).client as never,
      terms,
    )

    const result = await operation.execute()

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(3)
    for (const item of result.data) {
      expect(item).toHaveProperty('s')
      // Verify there's encrypted content
      expect(Object.keys(item).length).toBeGreaterThan(1)
    }
  }, 30000)

  it('should handle large containment objects', async () => {
    const largeObject: Record<string, unknown> = {}
    for (let i = 0; i < 50; i++) {
      largeObject[`key${i}`] = `value${i}`
    }

    const terms: JsonSearchTerm[] = [
      {
        value: largeObject,
        column: schema.metadata,
        table: schema,
        containmentType: 'contains',
      },
    ]

    const operation = new JsonSearchTermsOperation(
      (protectClient as unknown as { client: unknown }).client as never,
      terms,
    )

    const result = await operation.execute()

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toHaveProperty('sv')
    expect(result.data[0].sv).toHaveLength(50)
  }, 30000)
})

describe('JSON search terms - Error handling', () => {
  it('should throw error for column without ste_vec index configured', async () => {
    const terms: JsonSearchTerm[] = [
      {
        path: 'user.email',
        value: 'test@example.com',
        column: schemaWithoutSteVec.data,
        table: schemaWithoutSteVec,
      },
    ]

    const operation = new JsonSearchTermsOperation(
      (protectClient as unknown as { client: unknown }).client as never,
      terms,
    )

    const result = await operation.execute()

    expect(result.failure).toBeDefined()
    expect(result.failure?.message).toContain('does not have ste_vec index')
    expect(result.failure?.message).toContain('searchableJson()')
  }, 30000)

  it('should throw error for containment query on column without ste_vec', async () => {
    const terms: JsonSearchTerm[] = [
      {
        value: { role: 'admin' },
        column: schemaWithoutSteVec.data,
        table: schemaWithoutSteVec,
        containmentType: 'contains',
      },
    ]

    const operation = new JsonSearchTermsOperation(
      (protectClient as unknown as { client: unknown }).client as never,
      terms,
    )

    const result = await operation.execute()

    expect(result.failure).toBeDefined()
    expect(result.failure?.message).toContain('does not have ste_vec index')
  }, 30000)
})

describe('JSON search terms - Selector generation verification', () => {
  it('should generate correct selector format for path query', async () => {
    const terms: JsonSearchTerm[] = [
      {
        path: 'user.profile.name',
        value: 'John',
        column: schema.metadata,
        table: schema,
      },
    ]

    const operation = new JsonSearchTermsOperation(
      (protectClient as unknown as { client: unknown }).client as never,
      terms,
    )

    const result = await operation.execute()

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    // Verify selector is: table/column/path/segments
    const selector = result.data[0].s
    expect(selector).toMatch(/^test_json_search\/metadata\//)
    expect(selector).toBe('test_json_search/metadata/user/profile/name')
  }, 30000)

  it('should generate correct selector format for containment with nested object', async () => {
    const terms: JsonSearchTerm[] = [
      {
        value: {
          user: {
            profile: {
              role: 'admin',
            },
          },
        },
        column: schema.config,
        table: schema,
        containmentType: 'contains',
      },
    ]

    const operation = new JsonSearchTermsOperation(
      (protectClient as unknown as { client: unknown }).client as never,
      terms,
    )

    const result = await operation.execute()

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data[0]).toHaveProperty('sv')
    expect(result.data[0].sv).toHaveLength(1)

    // Deep path flattened to leaf
    const selector = result.data[0].sv![0].s
    expect(selector).toBe('test_json_search/config/user/profile/role')
  }, 30000)

  it('should verify encrypted content structure in path query', async () => {
    const terms: JsonSearchTerm[] = [
      {
        path: 'key',
        value: 'value',
        column: schema.metadata,
        table: schema,
      },
    ]

    const operation = new JsonSearchTermsOperation(
      (protectClient as unknown as { client: unknown }).client as never,
      terms,
    )

    const result = await operation.execute()

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    const encrypted = result.data[0]
    // Should have selector
    expect(encrypted).toHaveProperty('s')
    expect(encrypted.s).toBe('test_json_search/metadata/key')
    // Should have additional encrypted content (more than just selector)
    const keys = Object.keys(encrypted)
    expect(keys.length).toBeGreaterThan(1)
  }, 30000)

  it('should verify encrypted content structure in containment query', async () => {
    const terms: JsonSearchTerm[] = [
      {
        value: { key: 'value' },
        column: schema.metadata,
        table: schema,
        containmentType: 'contains',
      },
    ]

    const operation = new JsonSearchTermsOperation(
      (protectClient as unknown as { client: unknown }).client as never,
      terms,
    )

    const result = await operation.execute()

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    const encrypted = result.data[0]
    // Containment should have sv array
    expect(encrypted).toHaveProperty('sv')
    expect(Array.isArray(encrypted.sv)).toBe(true)

    // Each entry in sv should have selector and encrypted content
    for (const entry of encrypted.sv!) {
      expect(entry).toHaveProperty('s')
      // Should have additional encrypted properties
      const keys = Object.keys(entry)
      expect(keys.length).toBeGreaterThan(1)
    }
  }, 30000)
})
