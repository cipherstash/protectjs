/**
 * JSONB Array Operations Tests
 *
 * Tests for JSONB array-specific operations through Drizzle ORM.
 * These tests verify that the Drizzle integration correctly handles
 * encrypted JSONB array operations matching the proxy test patterns.
 *
 * Reference: .work/jsonb-test-coverage/proxy-tests-reference.md
 * - jsonb_array_elements.rs
 * - jsonb_array_length.rs
 *
 * Note: Encryption/decryption verification and Pattern B E2E tests have been
 * consolidated into separate files to eliminate duplication.
 * See: encryption-verification.test.ts and pattern-b-e2e.test.ts
 */
import 'dotenv/config'
import { type QueryTerm } from '@cipherstash/protect'
import { csColumn, csTable } from '@cipherstash/schema'
import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { encryptedType, extractProtectSchema } from '../../src/pg'
import { standardJsonbData, type StandardJsonbData } from '../fixtures/jsonb-test-data'
import {
  createJsonbTestSuite,
  STANDARD_TABLE_SQL,
} from '../helpers/jsonb-test-setup'
import {
  expectJsonPathSelectorOnly,
  expectJsonPathWithValue,
  expectOreTerm,
} from '../helpers/jsonb-query-helpers'

// =============================================================================
// Schema Definitions
// =============================================================================

const jsonbArrayOpsTable = pgTable('drizzle_jsonb_array_ops_test', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  encrypted_jsonb: encryptedType<StandardJsonbData>('encrypted_jsonb', {
    searchableJson: true,
  }),
  createdAt: timestamp('created_at').defaultNow(),
  testRunId: text('test_run_id'),
})

const arrayOpsSchema = extractProtectSchema(jsonbArrayOpsTable)

const searchableSchema = csTable('drizzle_jsonb_array_ops_test', {
  encrypted_jsonb: csColumn('encrypted_jsonb').searchableJson(),
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

// =============================================================================
// Test Setup
// =============================================================================

const { getProtectClient } = createJsonbTestSuite({
  tableName: 'array-ops',
  tableDefinition: jsonbArrayOpsTable,
  schema: arrayOpsSchema,
  additionalSchemas: [searchableSchema],
  testData: standardJsonbData,
  createTableSql: STANDARD_TABLE_SQL('drizzle_jsonb_array_ops_test'),
})

// =============================================================================
// jsonb_array_elements Tests
// =============================================================================

describe('JSONB Array Operations - jsonb_array_elements', () => {
  it('should generate array elements selector for string array via wildcard path', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'array_string[@]',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Array elements failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0])
  }, 30000)

  it('should generate array elements selector for numeric array via wildcard path', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'array_number[@]',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Array elements failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0])
  }, 30000)

  it('should generate array elements selector with [*] wildcard notation', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'array_string[*]',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Array elements failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0])
  }, 30000)

  it('should generate array elements with string value filter', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'array_string[@]',
        value: 'hello',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Array elements failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0])
  }, 30000)

  it('should generate array elements with numeric value filter', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'array_number[@]',
        value: 42,
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Array elements failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0])
  }, 30000)

  it('should generate array elements selector for unknown field (empty result)', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'nonexistent_array[@]',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Array elements failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0])
  }, 30000)
})

// =============================================================================
// jsonb_array_length Tests
// =============================================================================

describe('JSONB Array Operations - jsonb_array_length', () => {
  it('should generate range operation on string array length', async () => {
    const result = await getProtectClient().encryptQuery(2, {
      column: searchableSchema["jsonb_array_length(encrypted_jsonb->'array_string')"],
      table: searchableSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`Array length failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expectOreTerm(result.data)
  }, 30000)

  it('should generate range operation on numeric array length', async () => {
    const result = await getProtectClient().encryptQuery(3, {
      column: searchableSchema["jsonb_array_length(encrypted_jsonb->'array_number')"],
      table: searchableSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`Array length failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expectOreTerm(result.data)
  }, 30000)

  it('should handle array_length selector for unknown field (empty result)', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'nonexistent_array',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Array length failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0])
  }, 30000)
})

// =============================================================================
// Batch Array Operations Tests
// =============================================================================

describe('JSONB Array Operations - Batch Operations', () => {
  it('should handle batch of array element queries', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'array_string[@]',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
      {
        path: 'array_number[@]',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
      {
        path: 'array_string[*]',
        value: 'hello',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
      {
        path: 'array_number[*]',
        value: 42,
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Batch array ops failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(4)
    expectJsonPathSelectorOnly(result.data[0])
    expectJsonPathSelectorOnly(result.data[1])
    expectJsonPathWithValue(result.data[2])
    expectJsonPathWithValue(result.data[3])
  }, 30000)

  it('should handle batch of array length queries', async () => {
    const lengthValues = [1, 2, 3, 5, 10]

    const terms = lengthValues.map((val) => ({
      value: val,
      column: searchableSchema["jsonb_array_length(encrypted_jsonb->'array_string')"],
      table: searchableSchema,
      queryType: 'orderAndRange' as const,
    }))

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Batch array length failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(lengthValues.length)
    for (const term of result.data) {
      expectOreTerm(term)
    }
  }, 30000)
})

// =============================================================================
// Wildcard Notation Tests
// =============================================================================

describe('JSONB Array Operations - Wildcard Notation', () => {
  it('should handle [@] wildcard notation', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'array_string[@]',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Wildcard notation failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0])
  }, 30000)

  it('should handle [*] wildcard notation', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'array_string[*]',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Wildcard notation failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0])
  }, 30000)

  it('should handle nested arrays with wildcards', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'nested.items[@].values[@]',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Nested wildcards failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0])
  }, 30000)

  it('should handle specific index access', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'array_string[0]',
        value: 'hello',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Index access failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0])
  }, 30000)

  it('should handle last element access', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'array_string[-1]',
        value: 'world',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Last element access failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0])
  }, 30000)
})

// =============================================================================
// Edge Cases
// =============================================================================

describe('JSONB Array Operations - Edge Cases', () => {
  it('should handle empty array path', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'empty_array[@]',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Empty array failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0])
  }, 30000)

  it('should handle deeply nested array access', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'a.b.c.d.array[@].value',
        value: 'test',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Deep nested array failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0])
  }, 30000)

  it('should handle mixed wildcards and indices', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'items[@].nested[0].value',
        value: 'mixed',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Mixed wildcards failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0])
  }, 30000)
})
