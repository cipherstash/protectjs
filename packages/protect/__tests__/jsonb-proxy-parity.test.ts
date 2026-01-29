/**
 * JSONB Proxy Parity Tests
 *
 * These tests ensure protectjs has comprehensive coverage matching the proxy's JSONB operations.
 * Tests cover:
 * - JSONB extraction and manipulation (jsonb_array_elements, jsonb_array_length)
 * - Field access (-> operator, jsonb_get_field)
 * - Containment operations (@>, <@)
 * - Path operations (jsonb_path_exists, jsonb_path_query, jsonb_path_query_first)
 * - Comparison operations (=, >, >=, <, <=) on extracted values
 *
 * NOTE: Some tests intentionally duplicate existing coverage in json-protect.test.ts.
 * This is by design to verify that protectjs correctly handles the specific proxy SQL
 * patterns and JSONB-specific operations. These tests serve as parity verification that
 * the client library properly encodes and processes JSONB queries that the proxy will execute.
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

// Schema matching proxy test data structure
// The proxy tests use: {"string": "hello", "number": 42, "array_string": [...], "array_number": [...], "nested": {...}}
const jsonbSchema = csTable('test_jsonb_proxy_parity', {
  encrypted_jsonb: csColumn('encrypted_jsonb').searchableJson(),
  // Schema definitions for extracted JSON fields to enable comparison operations
  'encrypted_jsonb->>string': csColumn('encrypted_jsonb->>string')
    .dataType('string')
    .equality()
    .orderAndRange(),
  'encrypted_jsonb->>number': csColumn('encrypted_jsonb->>number')
    .dataType('number')
    .equality()
    .orderAndRange(),
  "jsonb_path_query_first(encrypted_jsonb, '$.string')": csColumn(
    "jsonb_path_query_first(encrypted_jsonb, '$.string')"
  )
    .dataType('string')
    .equality()
    .orderAndRange(),
  "jsonb_path_query_first(encrypted_jsonb, '$.number')": csColumn(
    "jsonb_path_query_first(encrypted_jsonb, '$.number')"
  )
    .dataType('number')
    .equality()
    .orderAndRange(),
  "jsonb_path_query_first(encrypted_jsonb, '$.nested.string')": csColumn(
    "jsonb_path_query_first(encrypted_jsonb, '$.nested.string')"
  )
    .dataType('string')
    .equality()
    .orderAndRange(),
  "jsonb_path_query_first(encrypted_jsonb, '$.nested.number')": csColumn(
    "jsonb_path_query_first(encrypted_jsonb, '$.nested.number')"
  )
    .dataType('number')
    .equality()
    .orderAndRange(),
  // Array length extraction
  "jsonb_array_length(encrypted_jsonb->'array_string')": csColumn(
    "jsonb_array_length(encrypted_jsonb->'array_string')"
  )
    .dataType('number')
    .orderAndRange(),
  "jsonb_array_length(encrypted_jsonb->'array_number')": csColumn(
    "jsonb_array_length(encrypted_jsonb->'array_number')"
  )
    .dataType('number')
    .orderAndRange(),
})

let protectClient: Awaited<ReturnType<typeof protect>>

beforeAll(async () => {
  protectClient = await protect({ schemas: [jsonbSchema] })
})

// =============================================================================
// TEST COVERAGE MAPPING
// =============================================================================
// This section maps describe blocks to the specific proxy SQL patterns being tested:
//
// 1. JSONB EXTRACTION & MANIPULATION
//    - jsonb_array_elements(jsonb_path_query(col, '$.array[[@]]'))
//    - jsonb_array_length(encrypted_jsonb->'array')
//
// 2. JSONB FIELD ACCESS
//    - Direct arrow operator: col -> 'field' or col -> '$.field'
//    - Multiple formats: simple name, dot notation, array format
//
// 3. JSONB CONTAINMENT OPERATIONS
//    - Contains (@>): col @> '{"key": "value"}'
//    - Contained By (<@): '{"key": "value"}' <@ col
//
// 4. JSONB PATH OPERATIONS
//    - jsonb_path_exists(col, '$.path')
//    - jsonb_path_query(col, '$.path')
//    - jsonb_path_query_first(col, '$.path')
//
// 5. JSONB COMPARISON OPERATIONS
//    - Equality (=), Greater (>), Greater or Equal (>=)
//    - Less (<), Less or Equal (<=)
//    - Both arrow operator and jsonb_path_query_first column definitions
//
// 6. DATA TYPES COVERAGE
//    - String, number, boolean, float/decimal, negative numbers
//    - Arrays (string/numeric), nested objects, null values
//
// 7. EDGE CASES & SPECIAL SCENARIOS
//    - Empty objects, deep nesting (10+ levels)
//    - Special characters, unicode, multiple array wildcards
//    - Complex nested paths, large containment objects (50+ keys)
//
// 8. BATCH OPERATIONS
//    - Mixed JSONB operations in single batch
//    - Comparison queries on extracted fields

// =============================================================================
// 1. JSONB EXTRACTION & MANIPULATION
// =============================================================================

describe('JSONB Extraction - jsonb_array_elements', () => {
  // SQL: SELECT jsonb_array_elements(jsonb_path_query(col, '$.array_string[@]'))

  it('should support array elements with string array via wildcard path', async () => {
    // Equivalent to: jsonb_array_elements(jsonb_path_query(col, '$.array_string[@]'))
    const terms: QueryTerm[] = [
      {
        path: 'array_string[@]',
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(
      result.data[0] as Record<string, unknown>,
      'array_string[@]'
    )
  }, 30000)

  it('should support array elements with numeric array via wildcard path', async () => {
    // Equivalent to: jsonb_array_elements(jsonb_path_query(col, '$.array_number[@]'))
    const terms: QueryTerm[] = [
      {
        path: 'array_number[@]',
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(
      result.data[0] as Record<string, unknown>,
      'array_number[@]'
    )
  }, 30000)

  it('should support array elements with [*] wildcard notation', async () => {
    // Alternative notation: $.array_string[*]
    const terms: QueryTerm[] = [
      {
        path: 'array_string[*]',
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(
      result.data[0] as Record<string, unknown>,
      'array_string[*]'
    )
  }, 30000)

  it('should support filtering array elements by value', async () => {
    // Equivalent to checking if 'hello' is in array_string
    const terms: QueryTerm[] = [
      {
        path: 'array_string[@]',
        value: 'hello',
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(
      result.data[0] as Record<string, unknown>,
      'array_string[@]',
      'hello'
    )
  }, 30000)

  it('should support filtering numeric array elements by value', async () => {
    // Checking if 42 is in array_number
    const terms: QueryTerm[] = [
      {
        path: 'array_number[@]',
        value: 42,
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(
      result.data[0] as Record<string, unknown>,
      'array_number[@]',
      42
    )
  }, 30000)

  it('should handle array_elements with unknown field (empty result)', async () => {
    // SQL: jsonb_array_elements(encrypted_jsonb->'nonexistent_array')
    // Proxy returns empty set when field doesn't exist
    // Client still generates valid selector - proxy handles the empty result
    const terms: QueryTerm[] = [
      {
        path: 'nonexistent_array[@]',
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    // Client generates selector - proxy returns empty when field doesn't exist
    expectJsonPathSelectorOnly(
      result.data[0] as Record<string, unknown>,
      'nonexistent_array[@]'
    )
  }, 30000)
})

describe('JSONB Extraction - jsonb_array_length', () => {
  // SQL: SELECT jsonb_array_length(jsonb_path_query(col, '$.array_string'))

  it('should support range operation on string array length', async () => {
    // SQL: jsonb_array_length(encrypted_jsonb->'array_string') > 2
    const result = await protectClient.encryptQuery(2, {
      column: jsonbSchema["jsonb_array_length(encrypted_jsonb->'array_string')"],
      table: jsonbSchema,
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
  }, 30000)

  it('should support range operation on numeric array length', async () => {
    // SQL: jsonb_array_length(encrypted_jsonb->'array_number') >= 3
    const result = await protectClient.encryptQuery(3, {
      column: jsonbSchema["jsonb_array_length(encrypted_jsonb->'array_number')"],
      table: jsonbSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('ob')
    expect(Array.isArray(result.data.ob)).toBe(true)
    expect(result.data.ob.length).toBeGreaterThan(0)
  }, 30000)

  it('should handle array_length with unknown field (empty result)', async () => {
    // SQL: jsonb_array_length(encrypted_jsonb->'nonexistent_array')
    // Proxy returns NULL when field doesn't exist (length of NULL is NULL)
    // Client generates valid search term - proxy handles the NULL case
    const terms: QueryTerm[] = [
      {
        path: 'nonexistent_array',
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    // Client generates selector - proxy returns NULL for length of unknown field
    expectJsonPathSelectorOnly(
      result.data[0] as Record<string, unknown>,
      'nonexistent_array'
    )
  }, 30000)
})

// =============================================================================
// 2. JSONB FIELD ACCESS (-> operator)
// =============================================================================

describe('JSONB Field Access - Direct Arrow Operator', () => {
  // SQL: encrypted_jsonb -> 'field' or encrypted_jsonb -> '$.field'

  it('should support get string field via path', async () => {
    // SQL: encrypted_jsonb -> 'string'
    const terms: QueryTerm[] = [
      {
        path: 'string',
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(
      result.data[0] as Record<string, unknown>,
      'string'
    )
  }, 30000)

  it('should support get numeric field via path', async () => {
    // SQL: encrypted_jsonb -> 'number'
    const terms: QueryTerm[] = [
      {
        path: 'number',
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(
      result.data[0] as Record<string, unknown>,
      'number'
    )
  }, 30000)

  it('should support get numeric array field via path', async () => {
    // SQL: encrypted_jsonb -> 'array_number'
    const terms: QueryTerm[] = [
      {
        path: 'array_number',
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(
      result.data[0] as Record<string, unknown>,
      'array_number'
    )
  }, 30000)

  it('should support get string array field via path', async () => {
    // SQL: encrypted_jsonb -> 'array_string'
    const terms: QueryTerm[] = [
      {
        path: 'array_string',
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(
      result.data[0] as Record<string, unknown>,
      'array_string'
    )
  }, 30000)

  it('should support get nested object field via path', async () => {
    // SQL: encrypted_jsonb -> 'nested'
    const terms: QueryTerm[] = [
      {
        path: 'nested',
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(
      result.data[0] as Record<string, unknown>,
      'nested'
    )
  }, 30000)

  it('should support get nested field via deep path', async () => {
    // SQL: encrypted_jsonb -> 'nested' -> 'string'
    const terms: QueryTerm[] = [
      {
        path: 'nested.string',
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(
      result.data[0] as Record<string, unknown>,
      'nested.string'
    )
  }, 30000)

  it('should handle unknown field path gracefully', async () => {
    // SQL: encrypted_jsonb -> 'blahvtha' (returns NULL in SQL)
    // Client-side still generates valid selector for unknown paths
    const terms: QueryTerm[] = [
      {
        path: 'nonexistent_field',
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    // Still generates a selector - proxy will return NULL/empty
    expectJsonPathSelectorOnly(
      result.data[0] as Record<string, unknown>,
      'nonexistent_field'
    )
  }, 30000)
})

describe('JSONB Field Access - Selector Flexibility', () => {
  // Both 'field' and '$.field' formats should work

  it('should accept simple field name format', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'string',
        value: 'hello',
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(
      result.data[0] as Record<string, unknown>,
      'string',
      'hello'
    )
  }, 30000)

  it('should accept nested field dot notation', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'nested.string',
        value: 'world',
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(
      result.data[0] as Record<string, unknown>,
      'nested.string',
      'world'
    )
  }, 30000)

  it('should accept path as array format', async () => {
    const terms: QueryTerm[] = [
      {
        path: ['nested', 'string'],
        value: 'world',
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(
      result.data[0] as Record<string, unknown>,
      'nested.string',
      'world'
    )
  }, 30000)
})

// =============================================================================
// 3. JSONB CONTAINMENT OPERATIONS
// =============================================================================

describe('JSONB Containment - Contains (@>) Operator', () => {
  // SQL: encrypted_jsonb @> '{"key": "value"}'

  it('should support contains with string value', async () => {
    // SQL: encrypted_jsonb @> '{"string": "hello"}'
    const terms: QueryTerm[] = [
      {
        contains: { string: 'hello' },
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectSteVecArray(result.data[0] as { sv: Array<Record<string, unknown>> })
  }, 30000)

  it('should support contains with number value', async () => {
    // SQL: encrypted_jsonb @> '{"number": 42}'
    const terms: QueryTerm[] = [
      {
        contains: { number: 42 },
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectSteVecArray(result.data[0] as { sv: Array<Record<string, unknown>> })
  }, 30000)

  it('should support contains with numeric array', async () => {
    // SQL: encrypted_jsonb @> '{"array_number": [42, 84]}'
    const terms: QueryTerm[] = [
      {
        contains: { array_number: [42, 84] },
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectSteVecArray(result.data[0] as { sv: Array<Record<string, unknown>> })
  }, 30000)

  it('should support contains with string array', async () => {
    // SQL: encrypted_jsonb @> '{"array_string": ["hello", "world"]}'
    const terms: QueryTerm[] = [
      {
        contains: { array_string: ['hello', 'world'] },
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectSteVecArray(result.data[0] as { sv: Array<Record<string, unknown>> })
  }, 30000)

  it('should support contains with nested object', async () => {
    // SQL: encrypted_jsonb @> '{"nested": {"number": 1815, "string": "world"}}'
    const terms: QueryTerm[] = [
      {
        contains: { nested: { number: 1815, string: 'world' } },
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectSteVecArray(result.data[0] as { sv: Array<Record<string, unknown>> })
  }, 30000)

  it('should support contains with partial nested object', async () => {
    // SQL: encrypted_jsonb @> '{"nested": {"string": "world"}}'
    const terms: QueryTerm[] = [
      {
        contains: { nested: { string: 'world' } },
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectSteVecArray(result.data[0] as { sv: Array<Record<string, unknown>> })
  }, 30000)
})

describe('JSONB Containment - Contained By (<@) Operator', () => {
  // SQL: '{"key": "value"}' <@ encrypted_jsonb

  it('should support contained_by with string value', async () => {
    // SQL: '{"string": "hello"}' <@ encrypted_jsonb
    const terms: QueryTerm[] = [
      {
        containedBy: { string: 'hello' },
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectSteVecArray(result.data[0] as { sv: Array<Record<string, unknown>> })
  }, 30000)

  it('should support contained_by with number value', async () => {
    // SQL: '{"number": 42}' <@ encrypted_jsonb
    const terms: QueryTerm[] = [
      {
        containedBy: { number: 42 },
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectSteVecArray(result.data[0] as { sv: Array<Record<string, unknown>> })
  }, 30000)

  it('should support contained_by with numeric array', async () => {
    // SQL: '{"array_number": [42, 84]}' <@ encrypted_jsonb
    const terms: QueryTerm[] = [
      {
        containedBy: { array_number: [42, 84] },
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectSteVecArray(result.data[0] as { sv: Array<Record<string, unknown>> })
  }, 30000)

  it('should support contained_by with string array', async () => {
    // SQL: '{"array_string": ["hello", "world"]}' <@ encrypted_jsonb
    const terms: QueryTerm[] = [
      {
        containedBy: { array_string: ['hello', 'world'] },
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectSteVecArray(result.data[0] as { sv: Array<Record<string, unknown>> })
  }, 30000)

  it('should support contained_by with nested object', async () => {
    // SQL: '{"nested": {"number": 1815, "string": "world"}}' <@ encrypted_jsonb
    const terms: QueryTerm[] = [
      {
        containedBy: { nested: { number: 1815, string: 'world' } },
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectSteVecArray(result.data[0] as { sv: Array<Record<string, unknown>> })
  }, 30000)
})

// =============================================================================
// 4. JSONB PATH OPERATIONS
// =============================================================================

describe('JSONB Path Operations - jsonb_path_exists', () => {
  // SQL: jsonb_path_exists(encrypted_jsonb, '$.path')
  // Client generates selector for path existence check

  it('should support path exists for number field', async () => {
    // SQL: jsonb_path_exists(encrypted_jsonb, '$.number')
    const terms: QueryTerm[] = [
      {
        path: 'number',
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(
      result.data[0] as Record<string, unknown>,
      'number'
    )
  }, 30000)

  it('should support path exists for nested string', async () => {
    // SQL: jsonb_path_exists(encrypted_jsonb, '$.nested.string')
    const terms: QueryTerm[] = [
      {
        path: 'nested.string',
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(
      result.data[0] as Record<string, unknown>,
      'nested.string'
    )
  }, 30000)

  it('should support path exists for nested object', async () => {
    // SQL: jsonb_path_exists(encrypted_jsonb, '$.nested')
    const terms: QueryTerm[] = [
      {
        path: 'nested',
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(
      result.data[0] as Record<string, unknown>,
      'nested'
    )
  }, 30000)

  it('should handle path exists for unknown path', async () => {
    // SQL: jsonb_path_exists(encrypted_jsonb, '$.vtha') -> false
    const terms: QueryTerm[] = [
      {
        path: 'unknown_path',
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    // Client still generates selector - proxy determines existence
    expectJsonPathSelectorOnly(
      result.data[0] as Record<string, unknown>,
      'unknown_path'
    )
  }, 30000)
})

describe('JSONB Path Operations - jsonb_path_query', () => {
  // SQL: jsonb_path_query(encrypted_jsonb, '$.path')

  it('should support path query for number', async () => {
    // SQL: jsonb_path_query(encrypted_jsonb, '$.number')
    const terms: QueryTerm[] = [
      {
        path: 'number',
        value: 42,
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(
      result.data[0] as Record<string, unknown>,
      'number',
      42
    )
  }, 30000)

  it('should support path query for nested string', async () => {
    // SQL: jsonb_path_query(encrypted_jsonb, '$.nested.string')
    const terms: QueryTerm[] = [
      {
        path: 'nested.string',
        value: 'world',
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(
      result.data[0] as Record<string, unknown>,
      'nested.string',
      'world'
    )
  }, 30000)

  it('should support path query for nested object', async () => {
    // SQL: jsonb_path_query(encrypted_jsonb, '$.nested')
    const terms: QueryTerm[] = [
      {
        path: 'nested',
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(
      result.data[0] as Record<string, unknown>,
      'nested'
    )
  }, 30000)

  it('should handle path_query with unknown path (empty set return)', async () => {
    // SQL: jsonb_path_query(encrypted_jsonb, '$.vtha')
    // Proxy returns empty set when path doesn't exist
    // Client still generates valid selector - proxy handles the empty result
    const terms: QueryTerm[] = [
      {
        path: 'unknown_deep.path.that.does.not.exist',
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    // Client generates selector - proxy returns empty set for unknown path
    expectJsonPathSelectorOnly(
      result.data[0] as Record<string, unknown>,
      'unknown_deep.path.that.does.not.exist'
    )
  }, 30000)
})

describe('JSONB Path Operations - jsonb_path_query_first', () => {
  // SQL: jsonb_path_query_first(encrypted_jsonb, '$.path')

  it('should support path query first for array wildcard string', async () => {
    // SQL: jsonb_path_query_first(encrypted_jsonb, '$.array_string[*]')
    const terms: QueryTerm[] = [
      {
        path: 'array_string[*]',
        value: 'hello',
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(
      result.data[0] as Record<string, unknown>,
      'array_string[*]',
      'hello'
    )
  }, 30000)

  it('should support path query first for array wildcard number', async () => {
    // SQL: jsonb_path_query_first(encrypted_jsonb, '$.array_number[*]')
    const terms: QueryTerm[] = [
      {
        path: 'array_number[*]',
        value: 42,
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(
      result.data[0] as Record<string, unknown>,
      'array_number[*]',
      42
    )
  }, 30000)

  it('should support path query first for nested string', async () => {
    // SQL: jsonb_path_query_first(encrypted_jsonb, '$.nested.string')
    const terms: QueryTerm[] = [
      {
        path: 'nested.string',
        value: 'world',
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(
      result.data[0] as Record<string, unknown>,
      'nested.string',
      'world'
    )
  }, 30000)

  it('should support path query first for nested object', async () => {
    // SQL: jsonb_path_query_first(encrypted_jsonb, '$.nested')
    const terms: QueryTerm[] = [
      {
        path: 'nested',
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(
      result.data[0] as Record<string, unknown>,
      'nested'
    )
  }, 30000)

  it('should handle path_query_first with unknown path (NULL return)', async () => {
    // SQL: jsonb_path_query_first(encrypted_jsonb, '$.unknown_field')
    // Proxy returns NULL when path doesn't exist (vs empty set for jsonb_path_query)
    // This is the key semantic difference: path_query returns empty set, path_query_first returns NULL
    const terms: QueryTerm[] = [
      {
        path: 'nonexistent_field_for_first',
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    // Client generates selector - proxy returns NULL for unknown path in path_query_first
    expectJsonPathSelectorOnly(
      result.data[0] as Record<string, unknown>,
      'nonexistent_field_for_first'
    )
  }, 30000)
})

// =============================================================================
// 5. JSONB COMPARISON OPERATIONS (WHERE Clause)
// =============================================================================

describe('JSONB Comparison - Equality (=)', () => {
  // SQL: col -> 'field' = $1 or jsonb_path_query_first(col, '$.field') = $1

  it('should support string equality via arrow operator column definition', async () => {
    // SQL: encrypted_jsonb -> 'string' = 'hello'
    const result = await protectClient.encryptQuery('hello', {
      column: jsonbSchema['encrypted_jsonb->>string'],
      table: jsonbSchema,
      queryType: 'equality',
    })

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('hm')
    expect(typeof result.data.hm).toBe('string')
  }, 30000)

  it('should support number equality via arrow operator column definition', async () => {
    // SQL: encrypted_jsonb -> 'number' = 42
    const result = await protectClient.encryptQuery(42, {
      column: jsonbSchema['encrypted_jsonb->>number'],
      table: jsonbSchema,
      queryType: 'equality',
    })

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('hm')
    expect(typeof result.data.hm).toBe('string')
  }, 30000)

  it('should support string equality via jsonb_path_query_first column definition', async () => {
    // SQL: jsonb_path_query_first(encrypted_jsonb, '$.string') = 'hello'
    const result = await protectClient.encryptQuery('hello', {
      column: jsonbSchema["jsonb_path_query_first(encrypted_jsonb, '$.string')"],
      table: jsonbSchema,
      queryType: 'equality',
    })

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('hm')
    expect(typeof result.data.hm).toBe('string')
  }, 30000)

  it('should support number equality via jsonb_path_query_first column definition', async () => {
    // SQL: jsonb_path_query_first(encrypted_jsonb, '$.number') = 42
    const result = await protectClient.encryptQuery(42, {
      column: jsonbSchema["jsonb_path_query_first(encrypted_jsonb, '$.number')"],
      table: jsonbSchema,
      queryType: 'equality',
    })

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('hm')
    expect(typeof result.data.hm).toBe('string')
  }, 30000)
})

describe('JSONB Comparison - Greater Than (>)', () => {
  // SQL: col -> 'field' > $1 or jsonb_path_query_first(col, '$.field') > $1

  it('should support string greater than via arrow operator column definition', async () => {
    // SQL: encrypted_jsonb -> 'string' > 'abc'
    const result = await protectClient.encryptQuery('abc', {
      column: jsonbSchema['encrypted_jsonb->>string'],
      table: jsonbSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('ob')
    expect(Array.isArray(result.data.ob)).toBe(true)
    expect(result.data.ob.length).toBeGreaterThan(0)
  }, 30000)

  it('should support number greater than via arrow operator column definition', async () => {
    // SQL: encrypted_jsonb -> 'number' > 30
    const result = await protectClient.encryptQuery(30, {
      column: jsonbSchema['encrypted_jsonb->>number'],
      table: jsonbSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('ob')
    expect(Array.isArray(result.data.ob)).toBe(true)
    expect(result.data.ob.length).toBeGreaterThan(0)
  }, 30000)

  it('should support string greater than via jsonb_path_query_first column definition', async () => {
    // SQL: jsonb_path_query_first(encrypted_jsonb, '$.string') > 'abc'
    const result = await protectClient.encryptQuery('abc', {
      column: jsonbSchema["jsonb_path_query_first(encrypted_jsonb, '$.string')"],
      table: jsonbSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('ob')
  }, 30000)

  it('should support number greater than via jsonb_path_query_first column definition', async () => {
    // SQL: jsonb_path_query_first(encrypted_jsonb, '$.number') > 30
    const result = await protectClient.encryptQuery(30, {
      column: jsonbSchema["jsonb_path_query_first(encrypted_jsonb, '$.number')"],
      table: jsonbSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('ob')
  }, 30000)
})

describe('JSONB Comparison - Greater Than or Equal (>=)', () => {
  // SQL: col -> 'field' >= $1

  it('should support string greater than or equal via arrow operator', async () => {
    // SQL: encrypted_jsonb -> 'string' >= 'hello'
    const result = await protectClient.encryptQuery('hello', {
      column: jsonbSchema['encrypted_jsonb->>string'],
      table: jsonbSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('ob')
    expect(Array.isArray(result.data.ob)).toBe(true)
  }, 30000)

  it('should support number greater than or equal via arrow operator', async () => {
    // SQL: encrypted_jsonb -> 'number' >= 42
    const result = await protectClient.encryptQuery(42, {
      column: jsonbSchema['encrypted_jsonb->>number'],
      table: jsonbSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('ob')
    expect(Array.isArray(result.data.ob)).toBe(true)
  }, 30000)

  it('should support nested string greater than or equal via jsonb_path_query_first', async () => {
    // SQL: jsonb_path_query_first(encrypted_jsonb, '$.nested.string') >= 'world'
    const result = await protectClient.encryptQuery('world', {
      column: jsonbSchema["jsonb_path_query_first(encrypted_jsonb, '$.nested.string')"],
      table: jsonbSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('ob')
  }, 30000)

  it('should support nested number greater than or equal via jsonb_path_query_first', async () => {
    // SQL: jsonb_path_query_first(encrypted_jsonb, '$.nested.number') >= 1000
    const result = await protectClient.encryptQuery(1000, {
      column: jsonbSchema["jsonb_path_query_first(encrypted_jsonb, '$.nested.number')"],
      table: jsonbSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('ob')
  }, 30000)
})

describe('JSONB Comparison - Less Than (<)', () => {
  // SQL: col -> 'field' < $1

  it('should support string less than via arrow operator', async () => {
    // SQL: encrypted_jsonb -> 'string' < 'xyz'
    const result = await protectClient.encryptQuery('xyz', {
      column: jsonbSchema['encrypted_jsonb->>string'],
      table: jsonbSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('ob')
    expect(Array.isArray(result.data.ob)).toBe(true)
  }, 30000)

  it('should support number less than via arrow operator', async () => {
    // SQL: encrypted_jsonb -> 'number' < 100
    const result = await protectClient.encryptQuery(100, {
      column: jsonbSchema['encrypted_jsonb->>number'],
      table: jsonbSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('ob')
    expect(Array.isArray(result.data.ob)).toBe(true)
  }, 30000)

  it('should support string less than via jsonb_path_query_first', async () => {
    // SQL: jsonb_path_query_first(encrypted_jsonb, '$.string') < 'xyz'
    const result = await protectClient.encryptQuery('xyz', {
      column: jsonbSchema["jsonb_path_query_first(encrypted_jsonb, '$.string')"],
      table: jsonbSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('ob')
  }, 30000)

  it('should support number less than via jsonb_path_query_first', async () => {
    // SQL: jsonb_path_query_first(encrypted_jsonb, '$.number') < 100
    const result = await protectClient.encryptQuery(100, {
      column: jsonbSchema["jsonb_path_query_first(encrypted_jsonb, '$.number')"],
      table: jsonbSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('ob')
  }, 30000)
})

describe('JSONB Comparison - Less Than or Equal (<=)', () => {
  // SQL: col -> 'field' <= $1

  it('should support string less than or equal via arrow operator', async () => {
    // SQL: encrypted_jsonb -> 'string' <= 'hello'
    const result = await protectClient.encryptQuery('hello', {
      column: jsonbSchema['encrypted_jsonb->>string'],
      table: jsonbSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('ob')
    expect(Array.isArray(result.data.ob)).toBe(true)
  }, 30000)

  it('should support number less than or equal via arrow operator', async () => {
    // SQL: encrypted_jsonb -> 'number' <= 42
    const result = await protectClient.encryptQuery(42, {
      column: jsonbSchema['encrypted_jsonb->>number'],
      table: jsonbSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('ob')
    expect(Array.isArray(result.data.ob)).toBe(true)
  }, 30000)

  it('should support nested string less than or equal via jsonb_path_query_first', async () => {
    // SQL: jsonb_path_query_first(encrypted_jsonb, '$.nested.string') <= 'world'
    const result = await protectClient.encryptQuery('world', {
      column: jsonbSchema["jsonb_path_query_first(encrypted_jsonb, '$.nested.string')"],
      table: jsonbSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('ob')
  }, 30000)

  it('should support nested number less than or equal via jsonb_path_query_first', async () => {
    // SQL: jsonb_path_query_first(encrypted_jsonb, '$.nested.number') <= 2000
    const result = await protectClient.encryptQuery(2000, {
      column: jsonbSchema["jsonb_path_query_first(encrypted_jsonb, '$.nested.number')"],
      table: jsonbSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('ob')
  }, 30000)
})

// =============================================================================
// 6. DATA TYPES COVERAGE
// =============================================================================

describe('JSONB Data Types Coverage', () => {
  it('should handle string data type in extraction', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'string',
        value: 'test_string',
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(
      result.data[0] as Record<string, unknown>,
      'string',
      'test_string'
    )
  }, 30000)

  it('should handle number/integer data type in extraction', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'number',
        value: 12345,
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(
      result.data[0] as Record<string, unknown>,
      'number',
      12345
    )
  }, 30000)

  it('should handle string array in containment', async () => {
    const terms: QueryTerm[] = [
      {
        contains: { array_string: ['item1', 'item2', 'item3'] },
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectSteVecArray(result.data[0] as { sv: Array<Record<string, unknown>> })
  }, 30000)

  it('should handle number array in containment', async () => {
    const terms: QueryTerm[] = [
      {
        contains: { array_number: [1, 2, 3, 4, 5] },
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectSteVecArray(result.data[0] as { sv: Array<Record<string, unknown>> })
  }, 30000)

  it('should handle nested object in containment', async () => {
    const terms: QueryTerm[] = [
      {
        contains: {
          nested: {
            level1: {
              level2: {
                value: 'deep',
              },
            },
          },
        },
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectSteVecArray(result.data[0] as { sv: Array<Record<string, unknown>> })
  }, 30000)

  it('should handle null value in containment', async () => {
    const terms: QueryTerm[] = [
      {
        contains: { nullable_field: null },
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectSteVecArray(result.data[0] as { sv: Array<Record<string, unknown>> })
  }, 30000)

  it('should handle boolean values in path query', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'is_active',
        value: true,
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(
      result.data[0] as Record<string, unknown>,
      'is_active',
      true
    )
  }, 30000)

  it('should handle float/decimal numbers', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'price',
        value: 99.99,
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(
      result.data[0] as Record<string, unknown>,
      'price',
      99.99
    )
  }, 30000)

  it('should handle negative numbers', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'balance',
        value: -500,
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(
      result.data[0] as Record<string, unknown>,
      'balance',
      -500
    )
  }, 30000)
})

// =============================================================================
// 7. EDGE CASES & SPECIAL SCENARIOS
// =============================================================================

describe('JSONB Edge Cases', () => {
  it('should handle empty object containment', async () => {
    const terms: QueryTerm[] = [
      {
        contains: {},
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    // Empty object still generates valid output
    expect(result.data[0]).toBeDefined()
  }, 30000)

  it('should handle deep nesting in path (10+ levels)', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'a.b.c.d.e.f.g.h.i.j.k.l',
        value: 'deep_value',
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(
      result.data[0] as Record<string, unknown>,
      'a.b.c.d.e.f.g.h.i.j.k.l',
      'deep_value'
    )
  }, 30000)

  it('should handle special characters in string values', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'message',
        value: 'Hello "world" with \'quotes\' and \\backslash\\',
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(
      result.data[0] as Record<string, unknown>,
      'message',
      'Hello "world" with \'quotes\' and \\backslash\\'
    )
  }, 30000)

  it('should handle unicode characters', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'greeting',
        value: '你好世界 🌍 مرحبا',
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(
      result.data[0] as Record<string, unknown>,
      'greeting',
      '你好世界 🌍 مرحبا'
    )
  }, 30000)

  it('should handle multiple array wildcards in path', async () => {
    // SQL pattern: $.matrix[*][*]
    const terms: QueryTerm[] = [
      {
        path: 'matrix[@][@]',
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(
      result.data[0] as Record<string, unknown>,
      'matrix[@][@]'
    )
  }, 30000)

  it('should handle complex nested array path', async () => {
    // SQL pattern: $.users[*].orders[*].items[0].name
    const terms: QueryTerm[] = [
      {
        path: 'users[@].orders[@].items[0].name',
        value: 'Widget',
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(
      result.data[0] as Record<string, unknown>,
      'users[@].orders[@].items[0].name',
      'Widget'
    )
  }, 30000)

  it('should handle large containment object (50+ keys)', async () => {
    const largeObject: Record<string, string> = {}
    for (let i = 0; i < 50; i++) {
      largeObject[`key${i}`] = `value${i}`
    }

    const terms: QueryTerm[] = [
      {
        contains: largeObject,
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectSteVecArray(result.data[0] as { sv: Array<Record<string, unknown>> })
    const svResult = result.data[0] as { sv: Array<unknown> }
    expect(svResult.sv.length).toBeGreaterThanOrEqual(50)
  }, 30000)
})

// =============================================================================
// 8. BATCH OPERATIONS
// =============================================================================

describe('JSONB Batch Operations', () => {
  it('should handle batch of mixed JSONB operations', async () => {
    const terms: QueryTerm[] = [
      // Path query with value
      {
        path: 'string',
        value: 'hello',
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
      // Containment query
      {
        contains: { number: 42 },
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
      // Path-only query
      {
        path: 'nested.string',
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
      // ContainedBy query
      {
        containedBy: { array_string: ['a', 'b'] },
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(4)

    // First: path query with value
    expectJsonPathWithValue(
      result.data[0] as Record<string, unknown>,
      'string',
      'hello'
    )

    // Second: containment query
    expectSteVecArray(result.data[1] as { sv: Array<Record<string, unknown>> })

    // Third: path-only query
    expectJsonPathSelectorOnly(
      result.data[2] as Record<string, unknown>,
      'nested.string'
    )

    // Fourth: containedBy query
    expectSteVecArray(result.data[3] as { sv: Array<Record<string, unknown>> })
  }, 30000)

  it('should handle batch of comparison queries on extracted fields', async () => {
    const terms: QueryTerm[] = [
      // String equality
      {
        value: 'hello',
        column: jsonbSchema['encrypted_jsonb->>string'],
        table: jsonbSchema,
        queryType: 'equality',
      },
      // Number equality
      {
        value: 42,
        column: jsonbSchema['encrypted_jsonb->>number'],
        table: jsonbSchema,
        queryType: 'equality',
      },
      // String range
      {
        value: 'abc',
        column: jsonbSchema['encrypted_jsonb->>string'],
        table: jsonbSchema,
        queryType: 'orderAndRange',
      },
      // Number range
      {
        value: 50,
        column: jsonbSchema['encrypted_jsonb->>number'],
        table: jsonbSchema,
        queryType: 'orderAndRange',
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(4)

    // First two: equality queries should have 'hm'
    expect(result.data[0]).toHaveProperty('hm')
    expect(result.data[1]).toHaveProperty('hm')

    // Last two: range queries should have 'ob'
    expect(result.data[2]).toHaveProperty('ob')
    expect(result.data[3]).toHaveProperty('ob')
  }, 30000)
})

// =============================================================================
// 9. LARGE DATASET CONTAINMENT TESTS (Index Verification)
// =============================================================================
// These tests verify that containment operations work correctly with large datasets
// and generate search terms suitable for indexed lookups (matching proxy's 500-row tests)

describe('JSONB Large Dataset Containment', () => {
  it('should handle large batch of containment queries (100 variations)', async () => {
    // Generate 100 different containment queries to simulate large dataset scenarios
    // This verifies the client can handle many containment terms efficiently
    const terms: QueryTerm[] = []
    for (let i = 0; i < 100; i++) {
      terms.push({
        contains: { [`key_${i}`]: `value_${i}` },
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      })
    }

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(100)

    // Verify all terms generated valid ste_vec arrays
    for (const term of result.data) {
      expectSteVecArray(term as { sv: Array<Record<string, unknown>> })
    }
  }, 60000)

  it('should handle large nested containment object (simulating complex document matching)', async () => {
    // Create a complex nested object that would match documents in a large dataset
    // This simulates the proxy's complex containment index tests
    const complexObject: Record<string, unknown> = {
      metadata: {
        created_by: 'user_123',
        tags: ['important', 'verified'],
        settings: {
          enabled: true,
          level: 5,
        },
      },
      attributes: {
        category: 'premium',
        scores: [85, 90, 95],
      },
    }

    const terms: QueryTerm[] = [
      {
        contains: complexObject,
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectSteVecArray(result.data[0] as { sv: Array<Record<string, unknown>> })

    // Verify the ste_vec has multiple entries for the complex nested structure
    const svResult = result.data[0] as { sv: Array<unknown> }
    expect(svResult.sv.length).toBeGreaterThan(5)
  }, 30000)

  it('should handle mixed containment types in large batch', async () => {
    // Mix of contains and contained_by operations, simulating varied query patterns
    const terms: QueryTerm[] = []

    // 50 contains queries
    for (let i = 0; i < 50; i++) {
      terms.push({
        contains: { field: `value_${i}` },
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      })
    }

    // 50 contained_by queries
    for (let i = 50; i < 100; i++) {
      terms.push({
        containedBy: { field: `value_${i}` },
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      })
    }

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(100)

    // Verify all generated valid search terms
    for (const term of result.data) {
      expectSteVecArray(term as { sv: Array<Record<string, unknown>> })
    }
  }, 60000)

  it('should handle array containment with many elements', async () => {
    // Create an array with many elements for containment check
    // Simulates checking if a large set of values is contained in a JSONB array
    const largeArray = Array.from({ length: 100 }, (_, i) => `item_${i}`)

    const terms: QueryTerm[] = [
      {
        contains: { items: largeArray },
        column: jsonbSchema.encrypted_jsonb,
        table: jsonbSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectSteVecArray(result.data[0] as { sv: Array<Record<string, unknown>> })

    // Verify the ste_vec has entries for all array elements
    const svResult = result.data[0] as { sv: Array<unknown> }
    expect(svResult.sv.length).toBeGreaterThanOrEqual(100)
  }, 30000)

  it('should handle containment with numeric range values', async () => {
    // Test containment with various numeric values including edge cases
    const numericValues = [
      0,
      1,
      -1,
      42,
      100,
      1000,
      -500,
      0.5,
      -0.5,
      999999,
      Number.MAX_SAFE_INTEGER,
      Number.MIN_SAFE_INTEGER,
    ]

    const terms: QueryTerm[] = numericValues.map((num) => ({
      contains: { count: num },
      column: jsonbSchema.encrypted_jsonb,
      table: jsonbSchema,
    }))

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(numericValues.length)

    for (const term of result.data) {
      expectSteVecArray(term as { sv: Array<Record<string, unknown>> })
    }
  }, 30000)

  it('should handle subset containment check pattern', async () => {
    // Test the subset vs exact match pattern used in proxy containment index tests
    // Generate terms that check if smaller objects are contained in larger ones
    const subsets = [
      { a: 1 }, // smallest subset
      { a: 1, b: 2 }, // larger subset
      { a: 1, b: 2, c: 3 }, // even larger
      { a: 1, b: 2, c: 3, d: 4, e: 5 }, // full object
    ]

    const terms: QueryTerm[] = subsets.map((subset) => ({
      contains: subset,
      column: jsonbSchema.encrypted_jsonb,
      table: jsonbSchema,
    }))

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(subsets.length)

    // Each larger subset should produce more ste_vec entries
    const svLengths = result.data.map((r) => (r as { sv: Array<unknown> }).sv.length)
    for (let i = 1; i < svLengths.length; i++) {
      expect(svLengths[i]).toBeGreaterThanOrEqual(svLengths[i - 1])
    }
  }, 30000)
})
