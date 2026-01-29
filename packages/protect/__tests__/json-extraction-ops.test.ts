import 'dotenv/config'
import { csColumn, csTable } from '@cipherstash/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { type QueryTerm, protect } from '../src'
import {
  expectJsonPathWithValue,
  expectJsonPathSelectorOnly,
} from './test-utils/query-terms'

const jsonSchema = csTable('test_json_extraction', {
  metadata: csColumn('metadata').searchableJson(),
  // Schema definitions for extracted JSON fields to enable ORE (Range/Order) operations
  'metadata->>age': csColumn('metadata->>age').dataType('number').orderAndRange(),
  "jsonb_path_query(metadata, '$.user.id')": csColumn("jsonb_path_query(metadata, '$.user.id')").dataType('number').orderAndRange().equality(),
  "jsonb_path_query_first(metadata, '$.score')": csColumn("jsonb_path_query_first(metadata, '$.score')").dataType('number').orderAndRange(),
  // Schema definition for array length queries
  "jsonb_array_length(metadata->'tags')": csColumn("jsonb_array_length(metadata->'tags')").dataType('number').orderAndRange(),
})

describe('JSON extraction operations - Equality', () => {
  let protectClient: Awaited<ReturnType<typeof protect>>

  beforeAll(async () => {
    protectClient = await protect({
      schemas: [jsonSchema],
    })
  })

  it('should support equality operation on field extracted via -> (single level)', async () => {
    // SQL equivalent: metadata->>'age' = '30'
    const terms: QueryTerm[] = [
      {
        path: 'age',
        value: '30',
        column: jsonSchema.metadata,
        table: jsonSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0] as Record<string, unknown>, 'age', '30')
  })

  it('should support equality operation on values extracted via jsonb_path_query (deep path)', async () => {
    // SQL equivalent: jsonb_path_query(metadata, '$.user.profile.id') = '"123"'
    const terms: QueryTerm[] = [
      {
        path: 'user.profile.id',
        value: '123',
        column: jsonSchema.metadata,
        table: jsonSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(
      result.data[0] as Record<string, unknown>,
      'user.profile.id',
      '123'
    )
  })

  it('should support equality operation on values extracted via jsonb_path_query (explicit index)', async () => {
    // SQL equivalent: jsonb_path_query(metadata, '$.user.id') = '123'
    const result = await protectClient.encryptQuery(123, {
      column: jsonSchema["jsonb_path_query(metadata, '$.user.id')"],
      table: jsonSchema,
      queryType: 'equality',
    })

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    // Unique index should have 'hm'
    expect(result.data).toHaveProperty('hm')
    expect(typeof result.data.hm).toBe('string')
    expect(result.data.hm).not.toBe('123')
    expect(JSON.stringify(result.data)).not.toContain('123')
  })

  it('should support field access via -> operator (path only)', async () => {
    // SQL equivalent: metadata->'age'
    const terms: QueryTerm[] = [
      {
        path: 'age',
        column: jsonSchema.metadata,
        table: jsonSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0] as Record<string, unknown>, 'age')
  })

  it('should support filtering by array elements using jsonb_array_elements equivalent (wildcard path)', async () => {
    // SQL equivalent: 'urgent' IN (SELECT jsonb_array_elements(metadata->'tags'))
    // Using ste_vec with wildcard path syntax
    const terms: QueryTerm[] = [
      {
        path: 'tags[*]',
        value: 'urgent',
        column: jsonSchema.metadata,
        table: jsonSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(
      result.data[0] as Record<string, unknown>,
      'tags[*]',
      'urgent'
    )
  })
})

describe('JSON extraction operations - Order and Range', () => {
  let protectClient: Awaited<ReturnType<typeof protect>>

  beforeAll(async () => {
    protectClient = await protect({
      schemas: [jsonSchema],
    })
  })

  it('should support range operation on field extracted via ->', async () => {
    // SQL equivalent: metadata->>age > 25
    const result = await protectClient.encryptQuery(25, {
      column: jsonSchema['metadata->>age'],
      table: jsonSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    // ORE index should have 'ob' (ore blocks)
    expect(result.data).toHaveProperty('ob')
    expect(Array.isArray(result.data.ob)).toBe(true)
    expect(result.data.ob.length).toBeGreaterThan(0)
    // Verify it looks like an encrypted block (hex string)
    expect(result.data.ob[0]).toMatch(/^[0-9a-f]+$/)
  })

  it('should support sorting on field extracted via ->', async () => {
    // Sorting on extracted field
    const result = await protectClient.encryptQuery(30, {
      column: jsonSchema['metadata->>age'],
      table: jsonSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('ob')
    expect(Array.isArray(result.data.ob)).toBe(true)
    expect(result.data.ob.length).toBeGreaterThan(0)
    expect(result.data.ob[0]).toMatch(/^[0-9a-f]+$/)
  })

  it('should support range operation on values extracted via jsonb_path_query', async () => {
    // Range query on jsonb_path_query extracted values
    const result = await protectClient.encryptQuery(100, {
      column: jsonSchema["jsonb_path_query(metadata, '$.user.id')"],
      table: jsonSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('ob')
    expect(Array.isArray(result.data.ob)).toBe(true)
    expect(result.data.ob.length).toBeGreaterThan(0)
    expect(result.data.ob[0]).toMatch(/^[0-9a-f]+$/)
  })

  it('should support range operation on values extracted via jsonb_path_query_first', async () => {
    // SQL equivalent: jsonb_path_query_first(metadata, '$.score') >= 50
    const result = await protectClient.encryptQuery(50, {
      column: jsonSchema["jsonb_path_query_first(metadata, '$.score')"],
      table: jsonSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('ob')
    expect(Array.isArray(result.data.ob)).toBe(true)
    expect(result.data.ob.length).toBeGreaterThan(0)
    expect(result.data.ob[0]).toMatch(/^[0-9a-f]+$/)
  })

  it('should support sorting on values extracted via jsonb_path_query', async () => {
    // Sorting on jsonb_path_query extracted values
    const result = await protectClient.encryptQuery(200, {
      column: jsonSchema["jsonb_path_query(metadata, '$.user.id')"],
      table: jsonSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('ob')
    expect(Array.isArray(result.data.ob)).toBe(true)
    expect(result.data.ob.length).toBeGreaterThan(0)
    expect(result.data.ob[0]).toMatch(/^[0-9a-f]+$/)
  })

  it('should support range operation on array length', async () => {
    // Range query on array length: jsonb_array_length(metadata->'tags') > 5
    const result = await protectClient.encryptQuery(5, {
      column: jsonSchema["jsonb_array_length(metadata->'tags')"],
      table: jsonSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('ob')
    expect(Array.isArray(result.data.ob)).toBe(true)
    expect(result.data.ob.length).toBeGreaterThan(0)
    expect(result.data.ob[0]).toMatch(/^[0-9a-f]+$/)
  })
})