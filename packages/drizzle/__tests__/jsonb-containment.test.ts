/**
 * JSONB Containment Operations Tests
 *
 * Tests for JSONB containment operations (@> and <@) through Drizzle ORM.
 * These tests verify that the Drizzle integration correctly handles
 * encrypted JSONB containment queries matching the proxy test patterns.
 *
 * Reference: .work/jsonb-test-coverage/proxy-tests-reference.md
 * - jsonb_contains.rs (@> operator)
 * - jsonb_contained_by.rs (<@ operator)
 * - jsonb_containment_index.rs (large dataset)
 */
import 'dotenv/config'
import { protect } from '@cipherstash/protect'
import { eq, sql } from 'drizzle-orm'
import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { encryptedType, extractProtectSchema } from '../src/pg'
import {
  containmentVariations,
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
 * Drizzle table with encrypted JSONB column for containment testing
 */
const jsonbContainmentTable = pgTable('drizzle_jsonb_containment_test', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  encrypted_jsonb: encryptedType<StandardJsonbData>('encrypted_jsonb', {
    dataType: 'json',
  }),
  createdAt: timestamp('created_at').defaultNow(),
  testRunId: text('test_run_id'),
})

// Extract Protect.js schema from Drizzle table
const containmentSchema = extractProtectSchema(jsonbContainmentTable)

// =============================================================================
// Test Setup
// =============================================================================

const TEST_RUN_ID = createTestRunId('containment')

let protectClient: Awaited<ReturnType<typeof protect>>
let db: ReturnType<typeof drizzle>
let insertedId: number

beforeAll(async () => {
  // Initialize Protect.js client
  protectClient = await protect({ schemas: [containmentSchema] })

  const client = postgres(process.env.DATABASE_URL as string)
  db = drizzle({ client })

  // Drop and recreate test table to ensure correct column type
  await db.execute(sql`DROP TABLE IF EXISTS drizzle_jsonb_containment_test`)
  await db.execute(sql`
    CREATE TABLE drizzle_jsonb_containment_test (
      id SERIAL PRIMARY KEY,
      encrypted_jsonb eql_v2_encrypted,
      created_at TIMESTAMP DEFAULT NOW(),
      test_run_id TEXT
    )
  `)

  // Encrypt and insert standard test data
  const encrypted = await protectClient.encryptModel(
    { encrypted_jsonb: standardJsonbData },
    containmentSchema,
  )

  if (encrypted.failure) {
    throw new Error(`Encryption failed: ${encrypted.failure.message}`)
  }

  const inserted = await db
    .insert(jsonbContainmentTable)
    .values({
      ...encrypted.data,
      testRunId: TEST_RUN_ID,
    })
    .returning({ id: jsonbContainmentTable.id })

  insertedId = inserted[0].id
}, 60000)

afterAll(async () => {
  // Clean up test data
  await db
    .delete(jsonbContainmentTable)
    .where(eq(jsonbContainmentTable.testRunId, TEST_RUN_ID))
}, 30000)

// =============================================================================
// Contains (@>) Operator Tests
// =============================================================================

describe('JSONB Containment - Contains (@>) via Drizzle', () => {
  it('should generate containment search term for string value', async () => {
    // SQL: encrypted_jsonb @> '{"string": "hello"}'
    const searchTerm = await protectClient.createSearchTerms([
      {
        value: containmentVariations.stringOnly,
        column: containmentSchema.encrypted_jsonb,
        table: containmentSchema,
        containmentType: 'contains',
      },
    ])

    if (searchTerm.failure) {
      throw new Error(`Search term creation failed: ${searchTerm.failure.message}`)
    }

    expect(searchTerm.data).toHaveLength(1)
    expect(searchTerm.data[0]).toHaveProperty('sv')
    expect(Array.isArray((searchTerm.data[0] as { sv: unknown[] }).sv)).toBe(true)
  }, 30000)

  it('should generate containment search term for number value', async () => {
    // SQL: encrypted_jsonb @> '{"number": 42}'
    const searchTerm = await protectClient.createSearchTerms([
      {
        value: containmentVariations.numberOnly,
        column: containmentSchema.encrypted_jsonb,
        table: containmentSchema,
        containmentType: 'contains',
      },
    ])

    if (searchTerm.failure) {
      throw new Error(`Search term creation failed: ${searchTerm.failure.message}`)
    }

    expect(searchTerm.data).toHaveLength(1)
    expect(searchTerm.data[0]).toHaveProperty('sv')
  }, 30000)

  it('should generate containment search term for string array', async () => {
    // SQL: encrypted_jsonb @> '{"array_string": ["hello", "world"]}'
    const searchTerm = await protectClient.createSearchTerms([
      {
        value: containmentVariations.stringArray,
        column: containmentSchema.encrypted_jsonb,
        table: containmentSchema,
        containmentType: 'contains',
      },
    ])

    if (searchTerm.failure) {
      throw new Error(`Search term creation failed: ${searchTerm.failure.message}`)
    }

    expect(searchTerm.data).toHaveLength(1)
    expect(searchTerm.data[0]).toHaveProperty('sv')
  }, 30000)

  it('should generate containment search term for numeric array', async () => {
    // SQL: encrypted_jsonb @> '{"array_number": [42, 84]}'
    const searchTerm = await protectClient.createSearchTerms([
      {
        value: containmentVariations.numberArray,
        column: containmentSchema.encrypted_jsonb,
        table: containmentSchema,
        containmentType: 'contains',
      },
    ])

    if (searchTerm.failure) {
      throw new Error(`Search term creation failed: ${searchTerm.failure.message}`)
    }

    expect(searchTerm.data).toHaveLength(1)
    expect(searchTerm.data[0]).toHaveProperty('sv')
  }, 30000)

  it('should generate containment search term for nested object', async () => {
    // SQL: encrypted_jsonb @> '{"nested": {"number": 1815, "string": "world"}}'
    const searchTerm = await protectClient.createSearchTerms([
      {
        value: containmentVariations.nestedFull,
        column: containmentSchema.encrypted_jsonb,
        table: containmentSchema,
        containmentType: 'contains',
      },
    ])

    if (searchTerm.failure) {
      throw new Error(`Search term creation failed: ${searchTerm.failure.message}`)
    }

    expect(searchTerm.data).toHaveLength(1)
    expect(searchTerm.data[0]).toHaveProperty('sv')
  }, 30000)

  it('should generate containment search term for partial nested object', async () => {
    // SQL: encrypted_jsonb @> '{"nested": {"string": "world"}}'
    const searchTerm = await protectClient.createSearchTerms([
      {
        value: containmentVariations.nestedPartial,
        column: containmentSchema.encrypted_jsonb,
        table: containmentSchema,
        containmentType: 'contains',
      },
    ])

    if (searchTerm.failure) {
      throw new Error(`Search term creation failed: ${searchTerm.failure.message}`)
    }

    expect(searchTerm.data).toHaveLength(1)
    expect(searchTerm.data[0]).toHaveProperty('sv')
  }, 30000)
})

// =============================================================================
// Contained By (<@) Operator Tests
// =============================================================================

describe('JSONB Containment - Contained By (<@) via Drizzle', () => {
  it('should generate contained_by search term for string value', async () => {
    // SQL: '{"string": "hello"}' <@ encrypted_jsonb
    const searchTerm = await protectClient.createSearchTerms([
      {
        value: containmentVariations.stringOnly,
        column: containmentSchema.encrypted_jsonb,
        table: containmentSchema,
        containmentType: 'contained_by',
      },
    ])

    if (searchTerm.failure) {
      throw new Error(`Search term creation failed: ${searchTerm.failure.message}`)
    }

    expect(searchTerm.data).toHaveLength(1)
    expect(searchTerm.data[0]).toHaveProperty('sv')
  }, 30000)

  it('should generate contained_by search term for number value', async () => {
    // SQL: '{"number": 42}' <@ encrypted_jsonb
    const searchTerm = await protectClient.createSearchTerms([
      {
        value: containmentVariations.numberOnly,
        column: containmentSchema.encrypted_jsonb,
        table: containmentSchema,
        containmentType: 'contained_by',
      },
    ])

    if (searchTerm.failure) {
      throw new Error(`Search term creation failed: ${searchTerm.failure.message}`)
    }

    expect(searchTerm.data).toHaveLength(1)
    expect(searchTerm.data[0]).toHaveProperty('sv')
  }, 30000)

  it('should generate contained_by search term for string array', async () => {
    // SQL: '{"array_string": ["hello", "world"]}' <@ encrypted_jsonb
    const searchTerm = await protectClient.createSearchTerms([
      {
        value: containmentVariations.stringArray,
        column: containmentSchema.encrypted_jsonb,
        table: containmentSchema,
        containmentType: 'contained_by',
      },
    ])

    if (searchTerm.failure) {
      throw new Error(`Search term creation failed: ${searchTerm.failure.message}`)
    }

    expect(searchTerm.data).toHaveLength(1)
    expect(searchTerm.data[0]).toHaveProperty('sv')
  }, 30000)

  it('should generate contained_by search term for numeric array', async () => {
    // SQL: '{"array_number": [42, 84]}' <@ encrypted_jsonb
    const searchTerm = await protectClient.createSearchTerms([
      {
        value: containmentVariations.numberArray,
        column: containmentSchema.encrypted_jsonb,
        table: containmentSchema,
        containmentType: 'contained_by',
      },
    ])

    if (searchTerm.failure) {
      throw new Error(`Search term creation failed: ${searchTerm.failure.message}`)
    }

    expect(searchTerm.data).toHaveLength(1)
    expect(searchTerm.data[0]).toHaveProperty('sv')
  }, 30000)

  it('should generate contained_by search term for nested object', async () => {
    // SQL: '{"nested": {"number": 1815, "string": "world"}}' <@ encrypted_jsonb
    const searchTerm = await protectClient.createSearchTerms([
      {
        value: containmentVariations.nestedFull,
        column: containmentSchema.encrypted_jsonb,
        table: containmentSchema,
        containmentType: 'contained_by',
      },
    ])

    if (searchTerm.failure) {
      throw new Error(`Search term creation failed: ${searchTerm.failure.message}`)
    }

    expect(searchTerm.data).toHaveLength(1)
    expect(searchTerm.data[0]).toHaveProperty('sv')
  }, 30000)
})

// =============================================================================
// Batch Containment Tests (Large Dataset Pattern)
// =============================================================================

describe('JSONB Containment - Batch Operations', () => {
  it('should handle batch of containment queries', async () => {
    // Generate multiple containment queries similar to 500-row test pattern
    const terms = Array.from({ length: 20 }, (_, i) => ({
      value: { [`key_${i}`]: `value_${i}` },
      column: containmentSchema.encrypted_jsonb,
      table: containmentSchema,
      containmentType: 'contains' as const,
    }))

    const result = await protectClient.createSearchTerms(terms)

    if (result.failure) {
      throw new Error(`Batch containment failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(20)
    for (const term of result.data) {
      expect(term).toHaveProperty('sv')
    }
  }, 60000)

  it('should handle mixed contains and contained_by batch', async () => {
    const containsTerms = Array.from({ length: 10 }, (_, i) => ({
      value: { field: `contains_${i}` },
      column: containmentSchema.encrypted_jsonb,
      table: containmentSchema,
      containmentType: 'contains' as const,
    }))

    const containedByTerms = Array.from({ length: 10 }, (_, i) => ({
      value: { field: `contained_by_${i}` },
      column: containmentSchema.encrypted_jsonb,
      table: containmentSchema,
      containmentType: 'contained_by' as const,
    }))

    const result = await protectClient.createSearchTerms([
      ...containsTerms,
      ...containedByTerms,
    ])

    if (result.failure) {
      throw new Error(`Mixed batch failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(20)
  }, 60000)

  it('should handle complex nested containment object', async () => {
    const complexObject = {
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

    const result = await protectClient.createSearchTerms([
      {
        value: complexObject,
        column: containmentSchema.encrypted_jsonb,
        table: containmentSchema,
        containmentType: 'contains',
      },
    ])

    if (result.failure) {
      throw new Error(`Complex containment failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toHaveProperty('sv')

    // Verify the ste_vec has multiple entries for the complex structure
    const svResult = result.data[0] as { sv: unknown[] }
    expect(svResult.sv.length).toBeGreaterThan(5)
  }, 30000)

  it('should handle array containment with many elements', async () => {
    const largeArray = Array.from({ length: 50 }, (_, i) => `item_${i}`)

    const result = await protectClient.createSearchTerms([
      {
        value: { items: largeArray },
        column: containmentSchema.encrypted_jsonb,
        table: containmentSchema,
        containmentType: 'contains',
      },
    ])

    if (result.failure) {
      throw new Error(`Array containment failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toHaveProperty('sv')

    const svResult = result.data[0] as { sv: unknown[] }
    expect(svResult.sv.length).toBeGreaterThanOrEqual(50)
  }, 30000)

  it('should handle containment with various numeric values', async () => {
    const numericValues = [0, 1, -1, 42, 100, -500, 0.5, -0.5, 999999]

    const terms = numericValues.map((num) => ({
      value: { count: num },
      column: containmentSchema.encrypted_jsonb,
      table: containmentSchema,
      containmentType: 'contains' as const,
    }))

    const result = await protectClient.createSearchTerms(terms)

    if (result.failure) {
      throw new Error(`Numeric containment failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(numericValues.length)
    for (const term of result.data) {
      expect(term).toHaveProperty('sv')
    }
  }, 30000)
})

// =============================================================================
// Edge Cases
// =============================================================================

describe('JSONB Containment - Edge Cases', () => {
  it('should handle empty object containment', async () => {
    const result = await protectClient.createSearchTerms([
      {
        value: {},
        column: containmentSchema.encrypted_jsonb,
        table: containmentSchema,
        containmentType: 'contains',
      },
    ])

    if (result.failure) {
      throw new Error(`Empty object containment failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
  }, 30000)

  it('should handle null value in containment object', async () => {
    const result = await protectClient.createSearchTerms([
      {
        value: { nullable_field: null },
        column: containmentSchema.encrypted_jsonb,
        table: containmentSchema,
        containmentType: 'contains',
      },
    ])

    if (result.failure) {
      throw new Error(`Null containment failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toHaveProperty('sv')
  }, 30000)

  it('should handle multiple field containment', async () => {
    const result = await protectClient.createSearchTerms([
      {
        value: containmentVariations.multipleFields,
        column: containmentSchema.encrypted_jsonb,
        table: containmentSchema,
        containmentType: 'contains',
      },
    ])

    if (result.failure) {
      throw new Error(`Multiple field containment failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toHaveProperty('sv')
  }, 30000)

  it('should handle large containment object (50+ keys)', async () => {
    const largeObject: Record<string, string> = {}
    for (let i = 0; i < 50; i++) {
      largeObject[`key${i}`] = `value${i}`
    }

    const result = await protectClient.createSearchTerms([
      {
        value: largeObject,
        column: containmentSchema.encrypted_jsonb,
        table: containmentSchema,
        containmentType: 'contains',
      },
    ])

    if (result.failure) {
      throw new Error(`Large object containment failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toHaveProperty('sv')

    const svResult = result.data[0] as { sv: unknown[] }
    expect(svResult.sv.length).toBeGreaterThanOrEqual(50)
  }, 30000)
})

// =============================================================================
// Encryption Verification Tests
// =============================================================================

describe('JSONB Containment - Encryption Verification', () => {
  it('should store encrypted data (not plaintext)', async () => {
    // Query raw value from database
    const rawRow = await db
      .select({ encrypted_jsonb: sql<string>`encrypted_jsonb::text` })
      .from(jsonbContainmentTable)
      .where(eq(jsonbContainmentTable.id, insertedId))

    expect(rawRow).toHaveLength(1)
    const rawValue = rawRow[0].encrypted_jsonb

    // Should NOT contain plaintext values from standardJsonbData
    expect(rawValue).not.toContain('"string":"hello"')
    expect(rawValue).not.toContain('"number":42')
    expect(rawValue).not.toContain('"array_string":["hello","world"]')

    // Should have encrypted structure (c = ciphertext indicator)
    expect(rawValue).toContain('"c"')
  }, 30000)

  it('should have encrypted structure with expected fields', async () => {
    // Query raw encrypted data
    const rawRow = await db
      .select({ encrypted_jsonb: jsonbContainmentTable.encrypted_jsonb })
      .from(jsonbContainmentTable)
      .where(eq(jsonbContainmentTable.id, insertedId))

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

describe('JSONB Containment - Decryption Verification', () => {
  it('should decrypt stored data correctly', async () => {
    const results = await db
      .select()
      .from(jsonbContainmentTable)
      .where(eq(jsonbContainmentTable.id, insertedId))

    expect(results).toHaveLength(1)

    const decrypted = await protectClient.decryptModel(results[0])
    if (decrypted.failure) {
      throw new Error(`Decryption failed: ${decrypted.failure.message}`)
    }

    // Verify decrypted values match original standardJsonbData
    const decryptedJsonb = decrypted.data.encrypted_jsonb
    expect(decryptedJsonb).toBeDefined()
    expect(decryptedJsonb!.string).toBe('hello')
    expect(decryptedJsonb!.number).toBe(42)
    expect(decryptedJsonb!.array_string).toEqual(['hello', 'world'])
    expect(decryptedJsonb!.array_number).toEqual([42, 84])
    expect(decryptedJsonb!.nested.string).toBe('world')
    expect(decryptedJsonb!.nested.number).toBe(1815)
  }, 30000)

  it('should round-trip encrypt and decrypt preserving all fields', async () => {
    // Fetch and decrypt all data
    const results = await db
      .select()
      .from(jsonbContainmentTable)
      .where(eq(jsonbContainmentTable.id, insertedId))

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
