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
 */
import 'dotenv/config'
import { protect, type SearchTerm } from '@cipherstash/protect'
import { csColumn, csTable } from '@cipherstash/schema'
import { eq, sql } from 'drizzle-orm'
import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { encryptedType, extractProtectSchema } from '../src/pg'
import {
  createTestRunId,
  standardJsonbData,
  type StandardJsonbData,
} from './fixtures/jsonb-test-data'

if (!process.env.DATABASE_URL) {
  throw new Error('Missing env.DATABASE_URL')
}

// =============================================================================
// Schema Definitions
// =============================================================================

/**
 * Drizzle table with encrypted JSONB column for array operations testing
 */
const jsonbArrayOpsTable = pgTable('drizzle_jsonb_array_ops_test', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  encrypted_jsonb: encryptedType<StandardJsonbData>('encrypted_jsonb', {
    dataType: 'json',
  }),
  createdAt: timestamp('created_at').defaultNow(),
  testRunId: text('test_run_id'),
})

// Extract Protect.js schema from Drizzle table
const arrayOpsSchema = extractProtectSchema(jsonbArrayOpsTable)

/**
 * Protect.js schema with searchableJson for creating search terms
 */
const searchableSchema = csTable('drizzle_jsonb_array_ops_test', {
  encrypted_jsonb: csColumn('encrypted_jsonb').searchableJson(),
  // Array length extracted fields for range operations
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

const TEST_RUN_ID = createTestRunId('array-ops')

let protectClient: Awaited<ReturnType<typeof protect>>
let db: ReturnType<typeof drizzle>
let insertedId: number

beforeAll(async () => {
  // Initialize Protect.js client
  protectClient = await protect({ schemas: [arrayOpsSchema, searchableSchema] })

  const client = postgres(process.env.DATABASE_URL as string)
  db = drizzle({ client })

  // Create test table if it doesn't exist
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS drizzle_jsonb_array_ops_test (
      id SERIAL PRIMARY KEY,
      encrypted_jsonb JSONB,
      created_at TIMESTAMP DEFAULT NOW(),
      test_run_id TEXT
    )
  `)

  // Encrypt and insert standard test data
  const encrypted = await protectClient.encryptModel(
    { encrypted_jsonb: standardJsonbData },
    arrayOpsSchema,
  )

  if (encrypted.failure) {
    throw new Error(`Encryption failed: ${encrypted.failure.message}`)
  }

  const inserted = await db
    .insert(jsonbArrayOpsTable)
    .values({
      ...encrypted.data,
      testRunId: TEST_RUN_ID,
    })
    .returning({ id: jsonbArrayOpsTable.id })

  insertedId = inserted[0].id
}, 60000)

afterAll(async () => {
  // Clean up test data
  await db
    .delete(jsonbArrayOpsTable)
    .where(eq(jsonbArrayOpsTable.testRunId, TEST_RUN_ID))
}, 30000)

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Verify the search term has selector-only format
 */
function expectJsonPathSelectorOnly(term: Record<string, unknown>): void {
  expect(term).toHaveProperty('s')
  expect(typeof term.s).toBe('string')
}

/**
 * Verify the search term has path with value format
 */
function expectJsonPathWithValue(term: Record<string, unknown>): void {
  expect(term).toHaveProperty('s')
  expect(typeof term.s).toBe('string')
  expect(term).toHaveProperty('sv')
  expect(Array.isArray(term.sv)).toBe(true)
}

// =============================================================================
// jsonb_array_elements Tests
// =============================================================================

describe('JSONB Array Operations - jsonb_array_elements', () => {
  it('should generate array elements selector for string array via wildcard path', async () => {
    // SQL: jsonb_array_elements(jsonb_path_query(encrypted_jsonb, '$.array_string[@]'))
    const terms: SearchTerm[] = [
      {
        path: 'array_string[@]',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.createSearchTerms(terms)

    if (result.failure) {
      throw new Error(`Array elements failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0] as Record<string, unknown>)
  }, 30000)

  it('should generate array elements selector for numeric array via wildcard path', async () => {
    // SQL: jsonb_array_elements(jsonb_path_query(encrypted_jsonb, '$.array_number[@]'))
    const terms: SearchTerm[] = [
      {
        path: 'array_number[@]',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.createSearchTerms(terms)

    if (result.failure) {
      throw new Error(`Array elements failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0] as Record<string, unknown>)
  }, 30000)

  it('should generate array elements selector with [*] wildcard notation', async () => {
    // Alternative notation: $.array_string[*]
    const terms: SearchTerm[] = [
      {
        path: 'array_string[*]',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.createSearchTerms(terms)

    if (result.failure) {
      throw new Error(`Array elements failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0] as Record<string, unknown>)
  }, 30000)

  it('should generate array elements with string value filter', async () => {
    // Check if 'hello' is in array_string
    const terms: SearchTerm[] = [
      {
        path: 'array_string[@]',
        value: 'hello',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.createSearchTerms(terms)

    if (result.failure) {
      throw new Error(`Array elements failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0] as Record<string, unknown>)
  }, 30000)

  it('should generate array elements with numeric value filter', async () => {
    // Check if 42 is in array_number
    const terms: SearchTerm[] = [
      {
        path: 'array_number[@]',
        value: 42,
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.createSearchTerms(terms)

    if (result.failure) {
      throw new Error(`Array elements failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0] as Record<string, unknown>)
  }, 30000)

  it('should generate array elements selector for unknown field (empty result)', async () => {
    // SQL: jsonb_array_elements(encrypted_jsonb->'nonexistent_array')
    // Proxy returns empty set when field doesn't exist
    const terms: SearchTerm[] = [
      {
        path: 'nonexistent_array[@]',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.createSearchTerms(terms)

    if (result.failure) {
      throw new Error(`Array elements failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0] as Record<string, unknown>)
  }, 30000)
})

// =============================================================================
// jsonb_array_length Tests
// =============================================================================

describe('JSONB Array Operations - jsonb_array_length', () => {
  it('should generate range operation on string array length', async () => {
    // SQL: jsonb_array_length(encrypted_jsonb->'array_string') > 2
    const result = await protectClient.encryptQuery(2, {
      column: searchableSchema["jsonb_array_length(encrypted_jsonb->'array_string')"],
      table: searchableSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`Array length failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('ob')
    expect(Array.isArray(result.data!.ob)).toBe(true)
    expect(result.data!.ob!.length).toBeGreaterThan(0)
  }, 30000)

  it('should generate range operation on numeric array length', async () => {
    // SQL: jsonb_array_length(encrypted_jsonb->'array_number') >= 3
    const result = await protectClient.encryptQuery(3, {
      column: searchableSchema["jsonb_array_length(encrypted_jsonb->'array_number')"],
      table: searchableSchema,
      queryType: 'orderAndRange',
    })

    if (result.failure) {
      throw new Error(`Array length failed: ${result.failure.message}`)
    }

    expect(result.data).toBeDefined()
    expect(result.data).toHaveProperty('ob')
    expect(Array.isArray(result.data!.ob)).toBe(true)
  }, 30000)

  it('should handle array_length selector for unknown field (empty result)', async () => {
    // SQL: jsonb_array_length(encrypted_jsonb->'nonexistent_array')
    // Proxy returns NULL when field doesn't exist
    const terms: SearchTerm[] = [
      {
        path: 'nonexistent_array',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.createSearchTerms(terms)

    if (result.failure) {
      throw new Error(`Array length failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0] as Record<string, unknown>)
  }, 30000)
})

// =============================================================================
// Batch Array Operations Tests
// =============================================================================

describe('JSONB Array Operations - Batch Operations', () => {
  it('should handle batch of array element queries', async () => {
    const terms: SearchTerm[] = [
      // String array with wildcard
      {
        path: 'array_string[@]',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
      // Numeric array with wildcard
      {
        path: 'array_number[@]',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
      // String array with value
      {
        path: 'array_string[*]',
        value: 'hello',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
      // Numeric array with value
      {
        path: 'array_number[*]',
        value: 42,
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.createSearchTerms(terms)

    if (result.failure) {
      throw new Error(`Batch array ops failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(4)

    // First two are selector-only
    expectJsonPathSelectorOnly(result.data[0] as Record<string, unknown>)
    expectJsonPathSelectorOnly(result.data[1] as Record<string, unknown>)

    // Last two have values
    expectJsonPathWithValue(result.data[2] as Record<string, unknown>)
    expectJsonPathWithValue(result.data[3] as Record<string, unknown>)
  }, 30000)

  it('should handle batch of array length queries', async () => {
    const lengthValues = [1, 2, 3, 5, 10]

    const terms = lengthValues.map((val) => ({
      value: val,
      column: searchableSchema["jsonb_array_length(encrypted_jsonb->'array_string')"],
      table: searchableSchema,
      queryType: 'orderAndRange' as const,
    }))

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Batch array length failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(lengthValues.length)
    for (const term of result.data) {
      expect(term).toHaveProperty('ob')
    }
  }, 30000)
})

// =============================================================================
// Wildcard Notation Tests
// =============================================================================

describe('JSONB Array Operations - Wildcard Notation', () => {
  it('should handle [@] wildcard notation', async () => {
    const terms: SearchTerm[] = [
      {
        path: 'array_string[@]',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.createSearchTerms(terms)

    if (result.failure) {
      throw new Error(`Wildcard notation failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0] as Record<string, unknown>)
  }, 30000)

  it('should handle [*] wildcard notation', async () => {
    const terms: SearchTerm[] = [
      {
        path: 'array_string[*]',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.createSearchTerms(terms)

    if (result.failure) {
      throw new Error(`Wildcard notation failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0] as Record<string, unknown>)
  }, 30000)

  it('should handle nested arrays with wildcards', async () => {
    // SQL pattern: $.nested.items[*].values[*]
    const terms: SearchTerm[] = [
      {
        path: 'nested.items[@].values[@]',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.createSearchTerms(terms)

    if (result.failure) {
      throw new Error(`Nested wildcards failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0] as Record<string, unknown>)
  }, 30000)

  it('should handle specific index access', async () => {
    // SQL: encrypted_jsonb->'array_string'->0
    const terms: SearchTerm[] = [
      {
        path: 'array_string[0]',
        value: 'hello',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.createSearchTerms(terms)

    if (result.failure) {
      throw new Error(`Index access failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0] as Record<string, unknown>)
  }, 30000)

  it('should handle last element access', async () => {
    // SQL: encrypted_jsonb->'array_string'->-1 (last element)
    const terms: SearchTerm[] = [
      {
        path: 'array_string[-1]',
        value: 'world',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.createSearchTerms(terms)

    if (result.failure) {
      throw new Error(`Last element access failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0] as Record<string, unknown>)
  }, 30000)
})

// =============================================================================
// Edge Cases
// =============================================================================

describe('JSONB Array Operations - Edge Cases', () => {
  it('should handle empty array path', async () => {
    // Querying an empty array field
    const terms: SearchTerm[] = [
      {
        path: 'empty_array[@]',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.createSearchTerms(terms)

    if (result.failure) {
      throw new Error(`Empty array failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0] as Record<string, unknown>)
  }, 30000)

  it('should handle deeply nested array access', async () => {
    // SQL pattern: $.a.b.c.d.array[*].value
    const terms: SearchTerm[] = [
      {
        path: 'a.b.c.d.array[@].value',
        value: 'test',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.createSearchTerms(terms)

    if (result.failure) {
      throw new Error(`Deep nested array failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0] as Record<string, unknown>)
  }, 30000)

  it('should handle mixed wildcards and indices', async () => {
    // SQL pattern: $.items[*].nested[0].value
    const terms: SearchTerm[] = [
      {
        path: 'items[@].nested[0].value',
        value: 'mixed',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.createSearchTerms(terms)

    if (result.failure) {
      throw new Error(`Mixed wildcards failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0] as Record<string, unknown>)
  }, 30000)
})

// =============================================================================
// Encryption Verification Tests
// =============================================================================

describe('JSONB Array Operations - Encryption Verification', () => {
  it('should store encrypted data (not plaintext)', async () => {
    // Query raw value from database
    const rawRow = await db
      .select({ encrypted_jsonb: sql<string>`encrypted_jsonb::text` })
      .from(jsonbArrayOpsTable)
      .where(eq(jsonbArrayOpsTable.id, insertedId))

    expect(rawRow).toHaveLength(1)
    const rawValue = rawRow[0].encrypted_jsonb

    // Should NOT contain plaintext values
    expect(rawValue).not.toContain('"array_string":["hello","world"]')
    expect(rawValue).not.toContain('"array_number":[42,84]')
    expect(rawValue).not.toContain('"string":"hello"')

    // Should have encrypted structure (c = ciphertext indicator)
    expect(rawValue).toContain('"c"')
  }, 30000)

  it('should have encrypted structure with expected fields', async () => {
    // Query raw encrypted data
    const rawRow = await db
      .select({ encrypted_jsonb: jsonbArrayOpsTable.encrypted_jsonb })
      .from(jsonbArrayOpsTable)
      .where(eq(jsonbArrayOpsTable.id, insertedId))

    expect(rawRow).toHaveLength(1)

    // The encrypted value should be an object with encryption metadata
    const encryptedValue = rawRow[0].encrypted_jsonb as Record<string, unknown>
    expect(encryptedValue).toBeDefined()

    // Should have ciphertext structure
    expect(encryptedValue).toHaveProperty('c')
  }, 30000)
})

// =============================================================================
// Decryption Verification Tests
// =============================================================================

describe('JSONB Array Operations - Decryption Verification', () => {
  it('should decrypt stored data correctly', async () => {
    const results = await db
      .select()
      .from(jsonbArrayOpsTable)
      .where(eq(jsonbArrayOpsTable.id, insertedId))

    expect(results).toHaveLength(1)

    const decrypted = await protectClient.decryptModel(results[0])
    if (decrypted.failure) {
      throw new Error(`Decryption failed: ${decrypted.failure.message}`)
    }

    // Verify decrypted values match original standardJsonbData
    const decryptedJsonb = decrypted.data.encrypted_jsonb
    expect(decryptedJsonb).toBeDefined()
    expect(decryptedJsonb!.array_string).toEqual(['hello', 'world'])
    expect(decryptedJsonb!.array_number).toEqual([42, 84])
    expect(decryptedJsonb!.string).toBe('hello')
    expect(decryptedJsonb!.number).toBe(42)
  }, 30000)

  it('should round-trip encrypt and decrypt preserving array fields', async () => {
    // Fetch and decrypt all data
    const results = await db
      .select()
      .from(jsonbArrayOpsTable)
      .where(eq(jsonbArrayOpsTable.id, insertedId))

    const decrypted = await protectClient.decryptModel(results[0])
    if (decrypted.failure) {
      throw new Error(`Decryption failed: ${decrypted.failure.message}`)
    }

    // Compare with original test data
    const original = standardJsonbData
    const decryptedJsonb = decrypted.data.encrypted_jsonb

    expect(decryptedJsonb).toEqual(original)
  }, 30000)
})
