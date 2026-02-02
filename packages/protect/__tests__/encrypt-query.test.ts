/**
 * encryptQuery API Tests
 *
 * Comprehensive tests for the encryptQuery API, covering:
 * - Scalar queries (equality, orderAndRange, freeTextSearch)
 * - JSON path queries (selector-only, path+value, deep paths, array wildcards)
 * - JSON containment queries (contains, containedBy)
 * - Bulk operations (multiple terms, mixed query types)
 * - Error handling
 */
import 'dotenv/config'
import { csColumn, csTable } from '@cipherstash/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { protect, type QueryTerm } from '../src'
import {
  expectSteVecArray,
  expectJsonPathWithValue,
  expectJsonPathSelectorOnly,
} from './test-utils/query-terms'

// Schema for scalar query tests
const scalarSchema = csTable('test_scalar_queries', {
  email: csColumn('email').freeTextSearch().equality().orderAndRange(),
  name: csColumn('name').freeTextSearch(),
  age: csColumn('age').dataType('number').equality().orderAndRange(),
})

// Schema for JSON query tests
const jsonSchema = csTable('test_json_queries', {
  metadata: csColumn('metadata').searchableJson(),
  config: csColumn('config').searchableJson(),
})

// Schema without searchableJson for error testing
const plainJsonSchema = csTable('test_plain_json', {
  data: csColumn('data').dataType('json'),
})

describe('encryptQuery API - Scalar Queries', () => {
  let protectClient: Awaited<ReturnType<typeof protect>>

  beforeAll(async () => {
    protectClient = await protect({ schemas: [scalarSchema] })
  })

  describe('Single value encryption', () => {
    it('should encrypt a single value with auto-inferred query type', async () => {
      const result = await protectClient.encryptQuery('test@example.com', {
        column: scalarSchema.email,
        table: scalarSchema,
      })

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toBeDefined()
      // Should have encrypted data with appropriate index
      expect(result.data).toHaveProperty('c')
    })

    it('should encrypt with explicit equality query type', async () => {
      const result = await protectClient.encryptQuery('test@example.com', {
        column: scalarSchema.email,
        table: scalarSchema,
        queryType: 'equality',
      })

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toBeDefined()
      expect(result.data).toHaveProperty('hm')
    })

    it('should encrypt with orderAndRange query type', async () => {
      const result = await protectClient.encryptQuery(25, {
        column: scalarSchema.age,
        table: scalarSchema,
        queryType: 'orderAndRange',
      })

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toBeDefined()
      expect(result.data).toHaveProperty('ob')
      expect(Array.isArray(result.data.ob)).toBe(true)
    })

    it('should encrypt with freeTextSearch query type', async () => {
      const result = await protectClient.encryptQuery('john', {
        column: scalarSchema.name,
        table: scalarSchema,
        queryType: 'freeTextSearch',
      })

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toBeDefined()
      expect(result.data).toHaveProperty('bf')
    })
  })
})

describe('encryptQuery API - JSON Path Queries', () => {
  let protectClient: Awaited<ReturnType<typeof protect>>

  beforeAll(async () => {
    protectClient = await protect({ schemas: [jsonSchema] })
  })

  describe('Selector-only queries (path without value)', () => {
    it('should create selector for simple path', async () => {
      const terms: QueryTerm[] = [
        {
          path: 'user.email',
          column: jsonSchema.metadata,
          table: jsonSchema,
        },
      ]

      const result = await protectClient.encryptQuery(terms)

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toHaveLength(1)
      expectJsonPathSelectorOnly(result.data[0] as Record<string, unknown>)
    })

    it('should create selector for deep path', async () => {
      const terms: QueryTerm[] = [
        {
          path: 'user.settings.preferences.theme',
          column: jsonSchema.metadata,
          table: jsonSchema,
        },
      ]

      const result = await protectClient.encryptQuery(terms)

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toHaveLength(1)
      expectJsonPathSelectorOnly(result.data[0] as Record<string, unknown>)
    })

    it('should create selector for array wildcard path', async () => {
      const terms: QueryTerm[] = [
        {
          path: 'items[@]',
          column: jsonSchema.metadata,
          table: jsonSchema,
        },
      ]

      const result = await protectClient.encryptQuery(terms)

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toHaveLength(1)
      expectJsonPathSelectorOnly(result.data[0] as Record<string, unknown>)
    })

    it('should accept path as array format', async () => {
      const terms: QueryTerm[] = [
        {
          path: ['user', 'profile', 'name'],
          column: jsonSchema.metadata,
          table: jsonSchema,
        },
      ]

      const result = await protectClient.encryptQuery(terms)

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toHaveLength(1)
      expectJsonPathSelectorOnly(result.data[0] as Record<string, unknown>)
    })
  })

  describe('Path with value queries', () => {
    it('should encrypt path with string value', async () => {
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
      expectJsonPathWithValue(result.data[0] as Record<string, unknown>)
    })

    it('should encrypt path with numeric value', async () => {
      const terms: QueryTerm[] = [
        {
          path: 'user.age',
          value: 25,
          column: jsonSchema.metadata,
          table: jsonSchema,
        },
      ]

      const result = await protectClient.encryptQuery(terms)

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toHaveLength(1)
      expectJsonPathWithValue(result.data[0] as Record<string, unknown>)
    })

    it('should encrypt path with boolean value', async () => {
      const terms: QueryTerm[] = [
        {
          path: 'user.active',
          value: true,
          column: jsonSchema.metadata,
          table: jsonSchema,
        },
      ]

      const result = await protectClient.encryptQuery(terms)

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toHaveLength(1)
      expectJsonPathWithValue(result.data[0] as Record<string, unknown>)
    })

    it('should encrypt array wildcard path with value', async () => {
      const terms: QueryTerm[] = [
        {
          path: 'tags[@]',
          value: 'premium',
          column: jsonSchema.metadata,
          table: jsonSchema,
        },
      ]

      const result = await protectClient.encryptQuery(terms)

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toHaveLength(1)
      expectJsonPathWithValue(result.data[0] as Record<string, unknown>)
    })
  })
})

describe('encryptQuery API - JSON Containment Queries', () => {
  let protectClient: Awaited<ReturnType<typeof protect>>

  beforeAll(async () => {
    protectClient = await protect({ schemas: [jsonSchema] })
  })

  describe('Contains (@>) queries', () => {
    it('should encrypt contains with simple object', async () => {
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
      expectSteVecArray(result.data[0] as { sv: Array<Record<string, unknown>> })
    })

    it('should encrypt contains with nested object', async () => {
      const terms: QueryTerm[] = [
        {
          contains: { user: { role: 'admin' } },
          column: jsonSchema.metadata,
          table: jsonSchema,
        },
      ]

      const result = await protectClient.encryptQuery(terms)

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toHaveLength(1)
      expectSteVecArray(result.data[0] as { sv: Array<Record<string, unknown>> })
    })

    it('should encrypt contains with array value', async () => {
      const terms: QueryTerm[] = [
        {
          contains: { tags: ['premium', 'verified'] },
          column: jsonSchema.metadata,
          table: jsonSchema,
        },
      ]

      const result = await protectClient.encryptQuery(terms)

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toHaveLength(1)
      expectSteVecArray(result.data[0] as { sv: Array<Record<string, unknown>> })
    })

    it('should encrypt contains with multiple keys', async () => {
      const terms: QueryTerm[] = [
        {
          contains: { role: 'admin', status: 'active' },
          column: jsonSchema.metadata,
          table: jsonSchema,
        },
      ]

      const result = await protectClient.encryptQuery(terms)

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toHaveLength(1)
      const encrypted = result.data[0] as { sv: Array<Record<string, unknown>> }
      expect(encrypted).toHaveProperty('sv')
      expect(encrypted.sv.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('Contained by (<@) queries', () => {
    it('should encrypt containedBy with simple object', async () => {
      const terms: QueryTerm[] = [
        {
          containedBy: { role: 'admin' },
          column: jsonSchema.metadata,
          table: jsonSchema,
        },
      ]

      const result = await protectClient.encryptQuery(terms)

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toHaveLength(1)
      expectSteVecArray(result.data[0] as { sv: Array<Record<string, unknown>> })
    })

    it('should encrypt containedBy with nested object', async () => {
      const terms: QueryTerm[] = [
        {
          containedBy: { user: { permissions: ['read', 'write', 'admin'] } },
          column: jsonSchema.metadata,
          table: jsonSchema,
        },
      ]

      const result = await protectClient.encryptQuery(terms)

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toHaveLength(1)
      expectSteVecArray(result.data[0] as { sv: Array<Record<string, unknown>> })
    })
  })
})

describe('encryptQuery API - Bulk Operations', () => {
  let protectClient: Awaited<ReturnType<typeof protect>>

  beforeAll(async () => {
    protectClient = await protect({ schemas: [jsonSchema] })
  })

  it('should handle multiple path queries in single call', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'user.email',
        value: 'test@example.com',
        column: jsonSchema.metadata,
        table: jsonSchema,
      },
      {
        path: 'user.name',
        value: 'John Doe',
        column: jsonSchema.metadata,
        table: jsonSchema,
      },
      {
        path: 'status',
        value: 'active',
        column: jsonSchema.metadata,
        table: jsonSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(3)
    for (const item of result.data) {
      expectJsonPathWithValue(item as Record<string, unknown>)
    }
  })

  it('should handle multiple containment queries in single call', async () => {
    const terms: QueryTerm[] = [
      {
        contains: { role: 'admin' },
        column: jsonSchema.metadata,
        table: jsonSchema,
      },
      {
        contains: { enabled: true },
        column: jsonSchema.config,
        table: jsonSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(2)
    for (const item of result.data) {
      expectSteVecArray(item as { sv: Array<Record<string, unknown>> })
    }
  })

  it('should handle mixed path and containment queries', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'user.email',
        value: 'test@example.com',
        column: jsonSchema.metadata,
        table: jsonSchema,
      },
      {
        contains: { role: 'admin' },
        column: jsonSchema.metadata,
        table: jsonSchema,
      },
      {
        path: 'settings.theme',
        column: jsonSchema.config,
        table: jsonSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(3)
    // First: path with value
    expectJsonPathWithValue(result.data[0] as Record<string, unknown>)
    // Second: containment
    expectSteVecArray(result.data[1] as { sv: Array<Record<string, unknown>> })
    // Third: path-only
    expectJsonPathSelectorOnly(result.data[2] as Record<string, unknown>)
  })

  it('should handle empty terms array', async () => {
    const terms: QueryTerm[] = []

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(0)
  })
})

describe('encryptQuery API - Error Handling', () => {
  let protectClient: Awaited<ReturnType<typeof protect>>

  beforeAll(async () => {
    protectClient = await protect({ schemas: [jsonSchema, plainJsonSchema] })
  })

  it('should fail for path query on column without ste_vec index', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'user.email',
        value: 'test@example.com',
        column: plainJsonSchema.data,
        table: plainJsonSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    expect(result.failure).toBeDefined()
    expect(result.failure?.message).toContain('does not have ste_vec index')
  })

  it('should fail for containment query on column without ste_vec index', async () => {
    const terms: QueryTerm[] = [
      {
        contains: { role: 'admin' },
        column: plainJsonSchema.data,
        table: plainJsonSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    expect(result.failure).toBeDefined()
    expect(result.failure?.message).toContain('does not have ste_vec index')
  })
})

describe('encryptQuery API - Edge Cases', () => {
  let protectClient: Awaited<ReturnType<typeof protect>>

  beforeAll(async () => {
    protectClient = await protect({ schemas: [jsonSchema] })
  })

  it('should handle unicode in paths', async () => {
    const terms: QueryTerm[] = [
      {
        path: ['用户', '电子邮件'],
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
    expectJsonPathWithValue(result.data[0] as Record<string, unknown>)
  })

  it('should handle unicode in values', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'message',
        value: '你好世界 🌍',
        column: jsonSchema.metadata,
        table: jsonSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0] as Record<string, unknown>)
  })

  it('should handle special characters in keys', async () => {
    const terms: QueryTerm[] = [
      {
        contains: { 'key-with-dash': 'value', key_with_underscore: 'value2' },
        column: jsonSchema.metadata,
        table: jsonSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    const encrypted = result.data[0] as { sv: Array<Record<string, unknown>> }
    expect(encrypted.sv.length).toBeGreaterThanOrEqual(2)
  })

  it('should handle null values in containment queries', async () => {
    const terms: QueryTerm[] = [
      {
        contains: { status: null },
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

  it('should handle deeply nested paths (10+ levels)', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'a.b.c.d.e.f.g.h.i.j.k',
        value: 'deep_value',
        column: jsonSchema.metadata,
        table: jsonSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0] as Record<string, unknown>)
  })

  it('should handle large containment objects (50 keys)', async () => {
    const largeObject: Record<string, unknown> = {}
    for (let i = 0; i < 50; i++) {
      largeObject[`key${i}`] = `value${i}`
    }

    const terms: QueryTerm[] = [
      {
        contains: largeObject,
        column: jsonSchema.metadata,
        table: jsonSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    const encrypted = result.data[0] as { sv: Array<Record<string, unknown>> }
    expect(encrypted.sv.length).toBeGreaterThanOrEqual(50)
  })
})

describe('encryptQuery API - Number Encryption', () => {
  let protectClient: Awaited<ReturnType<typeof protect>>

  beforeAll(async () => {
    protectClient = await protect({ schemas: [scalarSchema] })
  })

  describe('Number values with different query types', () => {
    it('should encrypt number with default (auto-inferred) query type', async () => {
      const result = await protectClient.encryptQuery(42, {
        column: scalarSchema.age,
        table: scalarSchema,
      })

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toBeDefined()
      // Auto-inferred should return encrypted data with 'c' property
      expect(result.data).toHaveProperty('c')
    })

    it('should encrypt number with equality query type', async () => {
      const result = await protectClient.encryptQuery(100, {
        column: scalarSchema.age,
        table: scalarSchema,
        queryType: 'equality',
      })

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toBeDefined()
      // Equality queries have 'hm' property
      expect(result.data).toHaveProperty('hm')
    })

    it('should encrypt number with orderAndRange query type', async () => {
      const result = await protectClient.encryptQuery(99, {
        column: scalarSchema.age,
        table: scalarSchema,
        queryType: 'orderAndRange',
      })

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toBeDefined()
      // ORE queries have 'ob' property (order block)
      expect(result.data).toHaveProperty('ob')
      expect(Array.isArray(result.data.ob)).toBe(true)
    })

    it('should encrypt negative numbers', async () => {
      const result = await protectClient.encryptQuery(-50, {
        column: scalarSchema.age,
        table: scalarSchema,
        queryType: 'orderAndRange',
      })

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toBeDefined()
      expect(result.data).toHaveProperty('ob')
    })

    it('should encrypt floating point numbers', async () => {
      const result = await protectClient.encryptQuery(99.99, {
        column: scalarSchema.age,
        table: scalarSchema,
        queryType: 'orderAndRange',
      })

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toBeDefined()
      expect(result.data).toHaveProperty('ob')
    })

    it('should encrypt zero', async () => {
      const result = await protectClient.encryptQuery(0, {
        column: scalarSchema.age,
        table: scalarSchema,
        queryType: 'equality',
      })

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toBeDefined()
      expect(result.data).toHaveProperty('hm')
    })
  })

  describe('Number values in batch operations', () => {
    it('should encrypt multiple numbers in batch with explicit queryType', async () => {
      const terms: QueryTerm[] = [
        {
          value: 42,
          column: scalarSchema.age,
          table: scalarSchema,
          queryType: 'equality',
        },
        {
          value: 100,
          column: scalarSchema.age,
          table: scalarSchema,
          queryType: 'orderAndRange',
        },
      ]

      const result = await protectClient.encryptQuery(terms)

      if (result.failure) {
        throw new Error(`[protect]: ${result.failure.message}`)
      }

      expect(result.data).toHaveLength(2)
      // First term used equality
      expect(result.data[0]).toHaveProperty('hm')
      // Second term used orderAndRange
      expect(result.data[1]).toHaveProperty('ob')
    })
  })
})
