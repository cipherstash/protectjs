/**
 * JSONB Comparison Operations Tests
 *
 * Tests for WHERE clause comparisons on extracted JSONB fields through Drizzle ORM.
 * These tests verify that the Drizzle integration correctly handles encrypted
 * JSONB comparison operations matching the proxy test patterns.
 *
 * Reference: .work/jsonb-test-coverage/proxy-tests-reference.md
 * - select_where_jsonb_eq.rs (=)
 * - select_where_jsonb_gt.rs (>)
 * - select_where_jsonb_gte.rs (>=)
 * - select_where_jsonb_lt.rs (<)
 * - select_where_jsonb_lte.rs (<=)
 *
 * Note: Encryption/decryption verification and Pattern B E2E tests have been
 * consolidated into separate files to eliminate duplication.
 * See: encryption-verification.test.ts and pattern-b-e2e.test.ts
 */
import 'dotenv/config'
import { csColumn, csTable } from '@cipherstash/schema'
import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { encryptedType, extractProtectSchema } from '../../src/pg'
import { comparisonTestData, type ComparisonTestData } from '../fixtures/jsonb-test-data'
import {
  createJsonbTestSuite,
  STANDARD_TABLE_SQL,
} from '../helpers/jsonb-test-setup'
import {
  expectHmacTerm,
  expectOreTerm,
} from '../helpers/jsonb-query-helpers'

// =============================================================================
// Schema Definitions
// =============================================================================

const jsonbComparisonTable = pgTable('drizzle_jsonb_comparison_test', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  encrypted_jsonb: encryptedType<ComparisonTestData>('encrypted_jsonb', {
    searchableJson: true,
  }),
  createdAt: timestamp('created_at').defaultNow(),
  testRunId: text('test_run_id'),
})

const comparisonSchema = extractProtectSchema(jsonbComparisonTable)

const extractedFieldsSchema = csTable('drizzle_jsonb_comparison_test', {
  encrypted_jsonb: csColumn('encrypted_jsonb').searchableJson(),
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
})

// =============================================================================
// Test Setup
// =============================================================================

const { getProtectClient } = createJsonbTestSuite({
  tableName: 'comparison',
  tableDefinition: jsonbComparisonTable,
  schema: comparisonSchema,
  additionalSchemas: [extractedFieldsSchema],
  testData: comparisonTestData,
  createTableSql: STANDARD_TABLE_SQL('drizzle_jsonb_comparison_test'),
})

// =============================================================================
// Equality (=) Comparison Tests
// =============================================================================

describe('JSONB Comparison - Equality (=)', () => {
  it('should generate equality query term for string via arrow operator', async () => {
    const result = await getProtectClient().encryptQuery('B', {
      column: extractedFieldsSchema['encrypted_jsonb->>string'],
      table: extractedFieldsSchema,
      queryType: 'equality',
    })

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expectHmacTerm(result.data)
  }, 30000)

  it('should generate equality query term for number via arrow operator', async () => {
    const result = await getProtectClient().encryptQuery(3, {
      column: extractedFieldsSchema['encrypted_jsonb->>number'],
      table: extractedFieldsSchema,
      queryType: 'equality',
    })

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expectHmacTerm(result.data)
  }, 30000)

  it('should generate equality query term for string via jsonb_path_query_first', async () => {
    const result = await getProtectClient().encryptQuery('B', {
      column: extractedFieldsSchema["jsonb_path_query_first(encrypted_jsonb, '$.string')"],
      table: extractedFieldsSchema,
      queryType: 'equality',
    })

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expectHmacTerm(result.data)
  }, 30000)

  it('should generate equality query term for number via jsonb_path_query_first', async () => {
    const result = await getProtectClient().encryptQuery(3, {
      column: extractedFieldsSchema["jsonb_path_query_first(encrypted_jsonb, '$.number')"],
      table: extractedFieldsSchema,
      queryType: 'equality',
    })

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expectHmacTerm(result.data)
  }, 30000)
})

// =============================================================================
// Greater Than (>) Comparison Tests
// =============================================================================

describe('JSONB Comparison - Greater Than (>)', () => {
  it('should generate greater than query term for string via arrow operator', async () => {
    const result = await getProtectClient().encryptQuery('C', {
      column: extractedFieldsSchema['encrypted_jsonb->>string'],
      table: extractedFieldsSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expectOreTerm(result.data)
  }, 30000)

  it('should generate greater than query term for number via arrow operator', async () => {
    const result = await getProtectClient().encryptQuery(4, {
      column: extractedFieldsSchema['encrypted_jsonb->>number'],
      table: extractedFieldsSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expectOreTerm(result.data)
  }, 30000)

  it('should generate greater than query term for string via jsonb_path_query_first', async () => {
    const result = await getProtectClient().encryptQuery('C', {
      column: extractedFieldsSchema["jsonb_path_query_first(encrypted_jsonb, '$.string')"],
      table: extractedFieldsSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expectOreTerm(result.data)
  }, 30000)

  it('should generate greater than query term for number via jsonb_path_query_first', async () => {
    const result = await getProtectClient().encryptQuery(4, {
      column: extractedFieldsSchema["jsonb_path_query_first(encrypted_jsonb, '$.number')"],
      table: extractedFieldsSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expectOreTerm(result.data)
  }, 30000)
})

// =============================================================================
// Greater Than or Equal (>=) Comparison Tests
// =============================================================================

describe('JSONB Comparison - Greater Than or Equal (>=)', () => {
  it('should generate gte query term for string via arrow operator', async () => {
    const result = await getProtectClient().encryptQuery('C', {
      column: extractedFieldsSchema['encrypted_jsonb->>string'],
      table: extractedFieldsSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expectOreTerm(result.data)
  }, 30000)

  it('should generate gte query term for number via arrow operator', async () => {
    const result = await getProtectClient().encryptQuery(4, {
      column: extractedFieldsSchema['encrypted_jsonb->>number'],
      table: extractedFieldsSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expectOreTerm(result.data)
  }, 30000)

  it('should generate gte query term for string via jsonb_path_query_first', async () => {
    const result = await getProtectClient().encryptQuery('C', {
      column: extractedFieldsSchema["jsonb_path_query_first(encrypted_jsonb, '$.string')"],
      table: extractedFieldsSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expectOreTerm(result.data)
  }, 30000)

  it('should generate gte query term for number via jsonb_path_query_first', async () => {
    const result = await getProtectClient().encryptQuery(4, {
      column: extractedFieldsSchema["jsonb_path_query_first(encrypted_jsonb, '$.number')"],
      table: extractedFieldsSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expectOreTerm(result.data)
  }, 30000)
})

// =============================================================================
// Less Than (<) Comparison Tests
// =============================================================================

describe('JSONB Comparison - Less Than (<)', () => {
  it('should generate less than query term for string via arrow operator', async () => {
    const result = await getProtectClient().encryptQuery('B', {
      column: extractedFieldsSchema['encrypted_jsonb->>string'],
      table: extractedFieldsSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expectOreTerm(result.data)
  }, 30000)

  it('should generate less than query term for number via arrow operator', async () => {
    const result = await getProtectClient().encryptQuery(3, {
      column: extractedFieldsSchema['encrypted_jsonb->>number'],
      table: extractedFieldsSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expectOreTerm(result.data)
  }, 30000)

  it('should generate less than query term for string via jsonb_path_query_first', async () => {
    const result = await getProtectClient().encryptQuery('B', {
      column: extractedFieldsSchema["jsonb_path_query_first(encrypted_jsonb, '$.string')"],
      table: extractedFieldsSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expectOreTerm(result.data)
  }, 30000)

  it('should generate less than query term for number via jsonb_path_query_first', async () => {
    const result = await getProtectClient().encryptQuery(3, {
      column: extractedFieldsSchema["jsonb_path_query_first(encrypted_jsonb, '$.number')"],
      table: extractedFieldsSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expectOreTerm(result.data)
  }, 30000)
})

// =============================================================================
// Less Than or Equal (<=) Comparison Tests
// =============================================================================

describe('JSONB Comparison - Less Than or Equal (<=)', () => {
  it('should generate lte query term for string via arrow operator', async () => {
    const result = await getProtectClient().encryptQuery('B', {
      column: extractedFieldsSchema['encrypted_jsonb->>string'],
      table: extractedFieldsSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expectOreTerm(result.data)
  }, 30000)

  it('should generate lte query term for number via arrow operator', async () => {
    const result = await getProtectClient().encryptQuery(3, {
      column: extractedFieldsSchema['encrypted_jsonb->>number'],
      table: extractedFieldsSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expectOreTerm(result.data)
  }, 30000)

  it('should generate lte query term for string via jsonb_path_query_first', async () => {
    const result = await getProtectClient().encryptQuery('B', {
      column: extractedFieldsSchema["jsonb_path_query_first(encrypted_jsonb, '$.string')"],
      table: extractedFieldsSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expectOreTerm(result.data)
  }, 30000)

  it('should generate lte query term for number via jsonb_path_query_first', async () => {
    const result = await getProtectClient().encryptQuery(3, {
      column: extractedFieldsSchema["jsonb_path_query_first(encrypted_jsonb, '$.number')"],
      table: extractedFieldsSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expectOreTerm(result.data)
  }, 30000)
})

// =============================================================================
// Batch Comparison Tests
// =============================================================================

describe('JSONB Comparison - Batch Operations', () => {
  it('should handle batch of comparison queries on extracted fields', async () => {
    const terms = [
      {
        value: 'B',
        column: extractedFieldsSchema['encrypted_jsonb->>string'],
        table: extractedFieldsSchema,
        queryType: 'equality' as const,
      },
      {
        value: 3,
        column: extractedFieldsSchema['encrypted_jsonb->>number'],
        table: extractedFieldsSchema,
        queryType: 'equality' as const,
      },
      {
        value: 'C',
        column: extractedFieldsSchema['encrypted_jsonb->>string'],
        table: extractedFieldsSchema,
        queryType: 'orderAndRange' as const,
      },
      {
        value: 4,
        column: extractedFieldsSchema['encrypted_jsonb->>number'],
        table: extractedFieldsSchema,
        queryType: 'orderAndRange' as const,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Batch comparison failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(4)
    expectHmacTerm(result.data[0])
    expectHmacTerm(result.data[1])
    expectOreTerm(result.data[2])
    expectOreTerm(result.data[3])
  }, 30000)

  it('should handle mixed string and number comparisons in batch', async () => {
    const stringValues = ['A', 'B', 'C', 'D', 'E']
    const numberValues = [1, 2, 3, 4, 5]

    const terms = [
      ...stringValues.map((val) => ({
        value: val,
        column: extractedFieldsSchema['encrypted_jsonb->>string'],
        table: extractedFieldsSchema,
        queryType: 'equality' as const,
      })),
      ...numberValues.map((val) => ({
        value: val,
        column: extractedFieldsSchema['encrypted_jsonb->>number'],
        table: extractedFieldsSchema,
        queryType: 'equality' as const,
      })),
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Mixed batch failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(10)
    for (const term of result.data) {
      expectHmacTerm(term)
    }
  }, 30000)
})

// =============================================================================
// Query Execution Tests
// =============================================================================

describe('JSONB Comparison - Query Execution', () => {
  it('should generate valid search terms for string equality comparison', async () => {
    const encryptedQuery = await getProtectClient().encryptQuery('B', {
      column: extractedFieldsSchema['encrypted_jsonb->>string'],
      table: extractedFieldsSchema,
      queryType: 'equality',
    })

    if (encryptedQuery.failure) {
      throw new Error(`Query encryption failed: ${encryptedQuery.failure.message}`)
    }

    expect(encryptedQuery.data).toBeDefined()
    expectHmacTerm(encryptedQuery.data)
  }, 30000)

  it('should generate valid search terms for numeric equality comparison', async () => {
    const encryptedQuery = await getProtectClient().encryptQuery(3, {
      column: extractedFieldsSchema['encrypted_jsonb->>number'],
      table: extractedFieldsSchema,
      queryType: 'equality',
    })

    if (encryptedQuery.failure) {
      throw new Error(`Query encryption failed: ${encryptedQuery.failure.message}`)
    }

    expect(encryptedQuery.data).toBeDefined()
    expectHmacTerm(encryptedQuery.data)
  }, 30000)

  it('should generate valid search terms for range comparison', async () => {
    const encryptedQuery = await getProtectClient().encryptQuery(3, {
      column: extractedFieldsSchema['encrypted_jsonb->>number'],
      table: extractedFieldsSchema,
      queryType: 'orderAndRange',
    })

    if (encryptedQuery.failure) {
      throw new Error(`Query encryption failed: ${encryptedQuery.failure.message}`)
    }

    expect(encryptedQuery.data).toBeDefined()
    expectOreTerm(encryptedQuery.data)
  }, 30000)
})
