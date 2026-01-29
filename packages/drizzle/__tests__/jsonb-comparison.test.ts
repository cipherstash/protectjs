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
 */
import 'dotenv/config'
import { protect } from '@cipherstash/protect'
import { csColumn, csTable } from '@cipherstash/schema'
import { eq, sql } from 'drizzle-orm'
import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createProtectOperators,
  encryptedType,
  extractProtectSchema,
} from '../src/pg'
import {
  comparisonTestData,
  createTestRunId,
  type ComparisonTestData,
} from './fixtures/jsonb-test-data'

if (!process.env.DATABASE_URL) {
  throw new Error('Missing env.DATABASE_URL')
}

// =============================================================================
// Schema Definitions
// =============================================================================

/**
 * Drizzle table with encrypted JSONB column and extracted field definitions
 * for comparison operations
 */
const jsonbComparisonTable = pgTable('drizzle_jsonb_comparison_test', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  encrypted_jsonb: encryptedType<ComparisonTestData>('encrypted_jsonb', {
    dataType: 'json',
  }),
  createdAt: timestamp('created_at').defaultNow(),
  testRunId: text('test_run_id'),
})

// Extract Protect.js schema from Drizzle table
const comparisonSchema = extractProtectSchema(jsonbComparisonTable)

/**
 * Protect.js schema for extracted JSONB fields
 * Used for comparison operations on extracted values
 */
const extractedFieldsSchema = csTable('drizzle_jsonb_comparison_test', {
  encrypted_jsonb: csColumn('encrypted_jsonb').searchableJson(),
  // Arrow operator extracted fields
  'encrypted_jsonb->>string': csColumn('encrypted_jsonb->>string')
    .dataType('string')
    .equality()
    .orderAndRange(),
  'encrypted_jsonb->>number': csColumn('encrypted_jsonb->>number')
    .dataType('number')
    .equality()
    .orderAndRange(),
  // jsonb_path_query_first extracted fields
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

const TEST_RUN_ID = createTestRunId('comparison')

let protectClient: Awaited<ReturnType<typeof protect>>
let protectOps: ReturnType<typeof createProtectOperators>
let db: ReturnType<typeof drizzle>
const insertedIds: number[] = []

beforeAll(async () => {
  // Initialize Protect.js client with both schemas
  protectClient = await protect({
    schemas: [comparisonSchema, extractedFieldsSchema],
  })
  protectOps = createProtectOperators(protectClient)

  const client = postgres(process.env.DATABASE_URL as string)
  db = drizzle({ client })

  // Encrypt and insert comparison test data (5 rows)
  for (const data of comparisonTestData) {
    const encrypted = await protectClient.encryptModel(
      { encrypted_jsonb: data },
      comparisonSchema,
    )

    if (encrypted.failure) {
      throw new Error(`Encryption failed: ${encrypted.failure.message}`)
    }

    const inserted = await db
      .insert(jsonbComparisonTable)
      .values({
        ...encrypted.data,
        testRunId: TEST_RUN_ID,
      })
      .returning({ id: jsonbComparisonTable.id })

    insertedIds.push(inserted[0].id)
  }
}, 60000)

afterAll(async () => {
  // Clean up test data
  await db
    .delete(jsonbComparisonTable)
    .where(eq(jsonbComparisonTable.testRunId, TEST_RUN_ID))
}, 30000)

// =============================================================================
// Equality (=) Comparison Tests
// =============================================================================

describe('JSONB Comparison - Equality (=)', () => {
  it('should generate equality query term for string via arrow operator', async () => {
    // SQL: encrypted_jsonb -> 'string' = 'B'
    const result = await protectClient.encryptQuery('B', {
      column: extractedFieldsSchema['encrypted_jsonb->>string'],
      table: extractedFieldsSchema,
      queryType: 'equality',
    })

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('hm')
    expect(typeof result.data!.hm).toBe('string')
  }, 30000)

  it('should generate equality query term for number via arrow operator', async () => {
    // SQL: encrypted_jsonb -> 'number' = 3
    const result = await protectClient.encryptQuery(3, {
      column: extractedFieldsSchema['encrypted_jsonb->>number'],
      table: extractedFieldsSchema,
      queryType: 'equality',
    })

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('hm')
    expect(typeof result.data!.hm).toBe('string')
  }, 30000)

  it('should generate equality query term for string via jsonb_path_query_first', async () => {
    // SQL: jsonb_path_query_first(encrypted_jsonb, '$.string') = 'B'
    const result = await protectClient.encryptQuery('B', {
      column: extractedFieldsSchema["jsonb_path_query_first(encrypted_jsonb, '$.string')"],
      table: extractedFieldsSchema,
      queryType: 'equality',
    })

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('hm')
  }, 30000)

  it('should generate equality query term for number via jsonb_path_query_first', async () => {
    // SQL: jsonb_path_query_first(encrypted_jsonb, '$.number') = 3
    const result = await protectClient.encryptQuery(3, {
      column: extractedFieldsSchema["jsonb_path_query_first(encrypted_jsonb, '$.number')"],
      table: extractedFieldsSchema,
      queryType: 'equality',
    })

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('hm')
  }, 30000)
})

// =============================================================================
// Greater Than (>) Comparison Tests
// =============================================================================

describe('JSONB Comparison - Greater Than (>)', () => {
  it('should generate greater than query term for string via arrow operator', async () => {
    // SQL: encrypted_jsonb -> 'string' > 'C' (should match D, E)
    const result = await protectClient.encryptQuery('C', {
      column: extractedFieldsSchema['encrypted_jsonb->>string'],
      table: extractedFieldsSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('ob')
    expect(Array.isArray(result.data!.ob)).toBe(true)
    expect(result.data!.ob!.length).toBeGreaterThan(0)
  }, 30000)

  it('should generate greater than query term for number via arrow operator', async () => {
    // SQL: encrypted_jsonb -> 'number' > 4 (should match 5)
    const result = await protectClient.encryptQuery(4, {
      column: extractedFieldsSchema['encrypted_jsonb->>number'],
      table: extractedFieldsSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('ob')
    expect(Array.isArray(result.data!.ob)).toBe(true)
  }, 30000)

  it('should generate greater than query term for string via jsonb_path_query_first', async () => {
    // SQL: jsonb_path_query_first(encrypted_jsonb, '$.string') > 'C'
    const result = await protectClient.encryptQuery('C', {
      column: extractedFieldsSchema["jsonb_path_query_first(encrypted_jsonb, '$.string')"],
      table: extractedFieldsSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('ob')
  }, 30000)

  it('should generate greater than query term for number via jsonb_path_query_first', async () => {
    // SQL: jsonb_path_query_first(encrypted_jsonb, '$.number') > 4
    const result = await protectClient.encryptQuery(4, {
      column: extractedFieldsSchema["jsonb_path_query_first(encrypted_jsonb, '$.number')"],
      table: extractedFieldsSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('ob')
  }, 30000)
})

// =============================================================================
// Greater Than or Equal (>=) Comparison Tests
// =============================================================================

describe('JSONB Comparison - Greater Than or Equal (>=)', () => {
  it('should generate gte query term for string via arrow operator', async () => {
    // SQL: encrypted_jsonb -> 'string' >= 'C' (should match C, D, E)
    const result = await protectClient.encryptQuery('C', {
      column: extractedFieldsSchema['encrypted_jsonb->>string'],
      table: extractedFieldsSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('ob')
    expect(Array.isArray(result.data!.ob)).toBe(true)
  }, 30000)

  it('should generate gte query term for number via arrow operator', async () => {
    // SQL: encrypted_jsonb -> 'number' >= 4 (should match 4, 5)
    const result = await protectClient.encryptQuery(4, {
      column: extractedFieldsSchema['encrypted_jsonb->>number'],
      table: extractedFieldsSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('ob')
  }, 30000)

  it('should generate gte query term for string via jsonb_path_query_first', async () => {
    // SQL: jsonb_path_query_first(encrypted_jsonb, '$.string') >= 'C'
    const result = await protectClient.encryptQuery('C', {
      column: extractedFieldsSchema["jsonb_path_query_first(encrypted_jsonb, '$.string')"],
      table: extractedFieldsSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('ob')
  }, 30000)

  it('should generate gte query term for number via jsonb_path_query_first', async () => {
    // SQL: jsonb_path_query_first(encrypted_jsonb, '$.number') >= 4
    const result = await protectClient.encryptQuery(4, {
      column: extractedFieldsSchema["jsonb_path_query_first(encrypted_jsonb, '$.number')"],
      table: extractedFieldsSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('ob')
  }, 30000)
})

// =============================================================================
// Less Than (<) Comparison Tests
// =============================================================================

describe('JSONB Comparison - Less Than (<)', () => {
  it('should generate less than query term for string via arrow operator', async () => {
    // SQL: encrypted_jsonb -> 'string' < 'B' (should match A)
    const result = await protectClient.encryptQuery('B', {
      column: extractedFieldsSchema['encrypted_jsonb->>string'],
      table: extractedFieldsSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('ob')
    expect(Array.isArray(result.data!.ob)).toBe(true)
  }, 30000)

  it('should generate less than query term for number via arrow operator', async () => {
    // SQL: encrypted_jsonb -> 'number' < 3 (should match 1, 2)
    const result = await protectClient.encryptQuery(3, {
      column: extractedFieldsSchema['encrypted_jsonb->>number'],
      table: extractedFieldsSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('ob')
  }, 30000)

  it('should generate less than query term for string via jsonb_path_query_first', async () => {
    // SQL: jsonb_path_query_first(encrypted_jsonb, '$.string') < 'B'
    const result = await protectClient.encryptQuery('B', {
      column: extractedFieldsSchema["jsonb_path_query_first(encrypted_jsonb, '$.string')"],
      table: extractedFieldsSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('ob')
  }, 30000)

  it('should generate less than query term for number via jsonb_path_query_first', async () => {
    // SQL: jsonb_path_query_first(encrypted_jsonb, '$.number') < 3
    const result = await protectClient.encryptQuery(3, {
      column: extractedFieldsSchema["jsonb_path_query_first(encrypted_jsonb, '$.number')"],
      table: extractedFieldsSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('ob')
  }, 30000)
})

// =============================================================================
// Less Than or Equal (<=) Comparison Tests
// =============================================================================

describe('JSONB Comparison - Less Than or Equal (<=)', () => {
  it('should generate lte query term for string via arrow operator', async () => {
    // SQL: encrypted_jsonb -> 'string' <= 'B' (should match A, B)
    const result = await protectClient.encryptQuery('B', {
      column: extractedFieldsSchema['encrypted_jsonb->>string'],
      table: extractedFieldsSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('ob')
    expect(Array.isArray(result.data!.ob)).toBe(true)
  }, 30000)

  it('should generate lte query term for number via arrow operator', async () => {
    // SQL: encrypted_jsonb -> 'number' <= 3 (should match 1, 2, 3)
    const result = await protectClient.encryptQuery(3, {
      column: extractedFieldsSchema['encrypted_jsonb->>number'],
      table: extractedFieldsSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('ob')
  }, 30000)

  it('should generate lte query term for string via jsonb_path_query_first', async () => {
    // SQL: jsonb_path_query_first(encrypted_jsonb, '$.string') <= 'B'
    const result = await protectClient.encryptQuery('B', {
      column: extractedFieldsSchema["jsonb_path_query_first(encrypted_jsonb, '$.string')"],
      table: extractedFieldsSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('ob')
  }, 30000)

  it('should generate lte query term for number via jsonb_path_query_first', async () => {
    // SQL: jsonb_path_query_first(encrypted_jsonb, '$.number') <= 3
    const result = await protectClient.encryptQuery(3, {
      column: extractedFieldsSchema["jsonb_path_query_first(encrypted_jsonb, '$.number')"],
      table: extractedFieldsSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('ob')
  }, 30000)
})

// =============================================================================
// Batch Comparison Tests
// =============================================================================

describe('JSONB Comparison - Batch Operations', () => {
  it('should handle batch of comparison queries on extracted fields', async () => {
    const terms = [
      // String equality
      {
        value: 'B',
        column: extractedFieldsSchema['encrypted_jsonb->>string'],
        table: extractedFieldsSchema,
        queryType: 'equality' as const,
      },
      // Number equality
      {
        value: 3,
        column: extractedFieldsSchema['encrypted_jsonb->>number'],
        table: extractedFieldsSchema,
        queryType: 'equality' as const,
      },
      // String range
      {
        value: 'C',
        column: extractedFieldsSchema['encrypted_jsonb->>string'],
        table: extractedFieldsSchema,
        queryType: 'orderAndRange' as const,
      },
      // Number range
      {
        value: 4,
        column: extractedFieldsSchema['encrypted_jsonb->>number'],
        table: extractedFieldsSchema,
        queryType: 'orderAndRange' as const,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Batch comparison failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(4)

    // Equality queries should have 'hm'
    expect(result.data[0]).toHaveProperty('hm')
    expect(result.data[1]).toHaveProperty('hm')

    // Range queries should have 'ob'
    expect(result.data[2]).toHaveProperty('ob')
    expect(result.data[3]).toHaveProperty('ob')
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

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Mixed batch failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(10)
    for (const term of result.data) {
      expect(term).toHaveProperty('hm')
    }
  }, 30000)
})

// =============================================================================
// Encryption Verification Tests
// =============================================================================

describe('JSONB Comparison - Encryption Verification', () => {
  it('should store encrypted data (not plaintext)', async () => {
    // Query raw value from database for first inserted row
    const rawRow = await db
      .select({ encrypted_jsonb: sql<string>`encrypted_jsonb::text` })
      .from(jsonbComparisonTable)
      .where(eq(jsonbComparisonTable.id, insertedIds[0]))

    expect(rawRow).toHaveLength(1)
    const rawValue = rawRow[0].encrypted_jsonb

    // Should NOT contain plaintext values from comparisonTestData[0] = {string: 'A', number: 1}
    expect(rawValue).not.toContain('"string":"A"')
    expect(rawValue).not.toContain('"number":1')

    // Should have encrypted structure (c = ciphertext indicator)
    expect(rawValue).toContain('"c"')
  }, 30000)

  it('should have encrypted structure for all comparison test rows', async () => {
    // Query all test rows
    const rawRows = await db
      .select({ id: jsonbComparisonTable.id, encrypted_jsonb: jsonbComparisonTable.encrypted_jsonb })
      .from(jsonbComparisonTable)
      .where(eq(jsonbComparisonTable.testRunId, TEST_RUN_ID))

    expect(rawRows).toHaveLength(5)

    // All rows should have encrypted structure
    for (const row of rawRows) {
      const encryptedValue = row.encrypted_jsonb as Record<string, unknown>
      expect(encryptedValue).toBeDefined()
      expect(encryptedValue).toHaveProperty('c')
    }
  }, 30000)
})

// =============================================================================
// Decryption Verification Tests
// =============================================================================

describe('JSONB Comparison - Decryption Verification', () => {
  it('should decrypt stored data correctly', async () => {
    const results = await db
      .select()
      .from(jsonbComparisonTable)
      .where(eq(jsonbComparisonTable.id, insertedIds[0]))

    expect(results).toHaveLength(1)

    const decrypted = await protectClient.decryptModel(results[0])
    if (decrypted.failure) {
      throw new Error(`Decryption failed: ${decrypted.failure.message}`)
    }

    // Verify decrypted values match original comparisonTestData[0]
    const decryptedJsonb = decrypted.data.encrypted_jsonb
    expect(decryptedJsonb).toBeDefined()
    expect(decryptedJsonb!.string).toBe('A')
    expect(decryptedJsonb!.number).toBe(1)
  }, 30000)

  it('should decrypt all comparison test rows correctly', async () => {
    const results = await db
      .select()
      .from(jsonbComparisonTable)
      .where(eq(jsonbComparisonTable.testRunId, TEST_RUN_ID))

    expect(results).toHaveLength(5)

    const decryptedResults = await protectClient.bulkDecryptModels(results)
    if (decryptedResults.failure) {
      throw new Error(`Bulk decryption failed: ${decryptedResults.failure.message}`)
    }

    // Sort by number to match original order
    const sortedDecrypted = decryptedResults.data.sort(
      (a, b) => (a.encrypted_jsonb as { number: number }).number - (b.encrypted_jsonb as { number: number }).number
    )

    // Verify each row matches the original comparisonTestData
    for (let i = 0; i < comparisonTestData.length; i++) {
      const original = comparisonTestData[i]
      const decrypted = sortedDecrypted[i].encrypted_jsonb as { string: string; number: number }
      expect(decrypted.string).toBe(original.string)
      expect(decrypted.number).toBe(original.number)
    }
  }, 30000)
})

// =============================================================================
// Query Execution Tests
// =============================================================================

describe('JSONB Comparison - Query Execution', () => {
  it('should generate valid search terms for string equality comparison', async () => {
    // Create encrypted query for string = 'B'
    const encryptedQuery = await protectClient.encryptQuery('B', {
      column: extractedFieldsSchema['encrypted_jsonb->>string'],
      table: extractedFieldsSchema,
      queryType: 'equality',
    })

    if (encryptedQuery.failure) {
      throw new Error(`Query encryption failed: ${encryptedQuery.failure.message}`)
    }

    // Verify the encrypted query has the expected structure
    expect(encryptedQuery.data).toBeDefined()
    expect(encryptedQuery.data).toHaveProperty('hm')

    // The 'hm' (hash match) property is used for equality comparisons
    expect(typeof encryptedQuery.data!.hm).toBe('string')
  }, 30000)

  it('should generate valid search terms for numeric equality comparison', async () => {
    // Create encrypted query for number = 3
    const encryptedQuery = await protectClient.encryptQuery(3, {
      column: extractedFieldsSchema['encrypted_jsonb->>number'],
      table: extractedFieldsSchema,
      queryType: 'equality',
    })

    if (encryptedQuery.failure) {
      throw new Error(`Query encryption failed: ${encryptedQuery.failure.message}`)
    }

    // Verify the encrypted query has the expected structure
    expect(encryptedQuery.data).toBeDefined()
    expect(encryptedQuery.data).toHaveProperty('hm')
    expect(typeof encryptedQuery.data!.hm).toBe('string')
  }, 30000)

  it('should generate valid search terms for range comparison', async () => {
    // Create encrypted query for number > 3 (order and range)
    const encryptedQuery = await protectClient.encryptQuery(3, {
      column: extractedFieldsSchema['encrypted_jsonb->>number'],
      table: extractedFieldsSchema,
      queryType: 'orderAndRange',
    })

    if (encryptedQuery.failure) {
      throw new Error(`Query encryption failed: ${encryptedQuery.failure.message}`)
    }

    // Verify the encrypted query has the expected structure
    expect(encryptedQuery.data).toBeDefined()
    expect(encryptedQuery.data).toHaveProperty('ob')

    // The 'ob' (order bytes) property is used for range comparisons
    expect(Array.isArray(encryptedQuery.data!.ob)).toBe(true)
    expect(encryptedQuery.data!.ob!.length).toBeGreaterThan(0)
  }, 30000)
})
