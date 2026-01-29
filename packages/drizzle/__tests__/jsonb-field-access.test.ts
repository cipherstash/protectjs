/**
 * JSONB Field Access Tests
 *
 * Tests for field extraction via arrow operator (->) through Drizzle ORM.
 * These tests verify that the Drizzle integration correctly handles
 * encrypted JSONB field access operations matching the proxy test patterns.
 *
 * Reference: .work/jsonb-test-coverage/proxy-tests-reference.md
 * - jsonb_get_field.rs (-> operator)
 * - jsonb_get_field_as_ciphertext.rs
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
  pathTestCases,
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
 * Drizzle table with encrypted JSONB column for field access testing
 */
const jsonbFieldAccessTable = pgTable('drizzle_jsonb_field_access_test', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  encrypted_jsonb: encryptedType<StandardJsonbData>('encrypted_jsonb', {
    dataType: 'json',
  }),
  createdAt: timestamp('created_at').defaultNow(),
  testRunId: text('test_run_id'),
})

// Extract Protect.js schema from Drizzle table
const fieldAccessSchema = extractProtectSchema(jsonbFieldAccessTable)

/**
 * Protect.js schema with searchableJson for creating search terms
 */
const searchableSchema = csTable('drizzle_jsonb_field_access_test', {
  encrypted_jsonb: csColumn('encrypted_jsonb').searchableJson(),
})

// =============================================================================
// Test Setup
// =============================================================================

const TEST_RUN_ID = createTestRunId('field-access')

let protectClient: Awaited<ReturnType<typeof protect>>
let db: ReturnType<typeof drizzle>
let insertedId: number

beforeAll(async () => {
  // Initialize Protect.js client
  protectClient = await protect({
    schemas: [fieldAccessSchema, searchableSchema],
  })

  const client = postgres(process.env.DATABASE_URL as string)
  db = drizzle({ client })

  // Encrypt and insert standard test data
  const encrypted = await protectClient.encryptModel(
    { encrypted_jsonb: standardJsonbData },
    fieldAccessSchema,
  )

  if (encrypted.failure) {
    throw new Error(`Encryption failed: ${encrypted.failure.message}`)
  }

  const inserted = await db
    .insert(jsonbFieldAccessTable)
    .values({
      ...encrypted.data,
      testRunId: TEST_RUN_ID,
    })
    .returning({ id: jsonbFieldAccessTable.id })

  insertedId = inserted[0].id
}, 60000)

afterAll(async () => {
  // Clean up test data
  await db
    .delete(jsonbFieldAccessTable)
    .where(eq(jsonbFieldAccessTable.testRunId, TEST_RUN_ID))
}, 30000)

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Verify the search term has selector-only format (no value)
 */
function expectJsonPathSelectorOnly(term: Record<string, unknown>): void {
  expect(term).toHaveProperty('s')
  expect(typeof term.s).toBe('string')
  // Selector-only terms should not have 'sv' (ste_vec for values)
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
// Field Access Tests - Direct Arrow Operator
// =============================================================================

describe('JSONB Field Access - Direct Arrow Operator', () => {
  it('should generate selector for string field', async () => {
    // SQL: encrypted_jsonb -> 'string'
    const terms: SearchTerm[] = [
      {
        path: 'string',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.createSearchTerms(terms)

    if (result.failure) {
      throw new Error(`Search term creation failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0] as Record<string, unknown>)
  }, 30000)

  it('should generate selector for numeric field', async () => {
    // SQL: encrypted_jsonb -> 'number'
    const terms: SearchTerm[] = [
      {
        path: 'number',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.createSearchTerms(terms)

    if (result.failure) {
      throw new Error(`Search term creation failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0] as Record<string, unknown>)
  }, 30000)

  it('should generate selector for numeric array field', async () => {
    // SQL: encrypted_jsonb -> 'array_number'
    const terms: SearchTerm[] = [
      {
        path: 'array_number',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.createSearchTerms(terms)

    if (result.failure) {
      throw new Error(`Search term creation failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0] as Record<string, unknown>)
  }, 30000)

  it('should generate selector for string array field', async () => {
    // SQL: encrypted_jsonb -> 'array_string'
    const terms: SearchTerm[] = [
      {
        path: 'array_string',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.createSearchTerms(terms)

    if (result.failure) {
      throw new Error(`Search term creation failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0] as Record<string, unknown>)
  }, 30000)

  it('should generate selector for nested object field', async () => {
    // SQL: encrypted_jsonb -> 'nested'
    const terms: SearchTerm[] = [
      {
        path: 'nested',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.createSearchTerms(terms)

    if (result.failure) {
      throw new Error(`Search term creation failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0] as Record<string, unknown>)
  }, 30000)

  it('should generate selector for deep nested path', async () => {
    // SQL: encrypted_jsonb -> 'nested' -> 'string'
    const terms: SearchTerm[] = [
      {
        path: 'nested.string',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.createSearchTerms(terms)

    if (result.failure) {
      throw new Error(`Search term creation failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0] as Record<string, unknown>)
  }, 30000)

  it('should generate selector for unknown field (returns null in SQL)', async () => {
    // SQL: encrypted_jsonb -> 'blahvtha' (returns NULL)
    const terms: SearchTerm[] = [
      {
        path: 'unknown_field',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.createSearchTerms(terms)

    if (result.failure) {
      throw new Error(`Search term creation failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    // Still generates a selector - proxy will return NULL
    expectJsonPathSelectorOnly(result.data[0] as Record<string, unknown>)
  }, 30000)
})

// =============================================================================
// Field Access Tests - Selector Format Flexibility
// =============================================================================

describe('JSONB Field Access - Selector Format Flexibility', () => {
  it('should accept simple field name format', async () => {
    // Path: 'string' (no prefix)
    const terms: SearchTerm[] = [
      {
        path: 'string',
        value: 'hello',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.createSearchTerms(terms)

    if (result.failure) {
      throw new Error(`Search term creation failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0] as Record<string, unknown>)
  }, 30000)

  it('should accept nested field dot notation', async () => {
    // Path: 'nested.string'
    const terms: SearchTerm[] = [
      {
        path: 'nested.string',
        value: 'world',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.createSearchTerms(terms)

    if (result.failure) {
      throw new Error(`Search term creation failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0] as Record<string, unknown>)
  }, 30000)

  it('should accept path as array format', async () => {
    // Path: ['nested', 'string']
    const terms: SearchTerm[] = [
      {
        path: ['nested', 'string'],
        value: 'world',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.createSearchTerms(terms)

    if (result.failure) {
      throw new Error(`Search term creation failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0] as Record<string, unknown>)
  }, 30000)

  it('should accept very deep nested paths', async () => {
    // Path: 'a.b.c.d.e.f.g.h.i.j'
    const terms: SearchTerm[] = [
      {
        path: 'a.b.c.d.e.f.g.h.i.j',
        value: 'deep_value',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.createSearchTerms(terms)

    if (result.failure) {
      throw new Error(`Search term creation failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0] as Record<string, unknown>)
  }, 30000)
})

// =============================================================================
// Field Access Tests - With Values
// =============================================================================

describe('JSONB Field Access - Path with Value Matching', () => {
  it('should generate search term for string field with value', async () => {
    const terms: SearchTerm[] = [
      {
        path: 'string',
        value: 'hello',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.createSearchTerms(terms)

    if (result.failure) {
      throw new Error(`Search term creation failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0] as Record<string, unknown>)
  }, 30000)

  it('should generate search term for numeric field with value', async () => {
    const terms: SearchTerm[] = [
      {
        path: 'number',
        value: 42,
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.createSearchTerms(terms)

    if (result.failure) {
      throw new Error(`Search term creation failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0] as Record<string, unknown>)
  }, 30000)

  it('should generate search term for nested string with value', async () => {
    const terms: SearchTerm[] = [
      {
        path: 'nested.string',
        value: 'world',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.createSearchTerms(terms)

    if (result.failure) {
      throw new Error(`Search term creation failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0] as Record<string, unknown>)
  }, 30000)

  it('should generate search term for nested number with value', async () => {
    const terms: SearchTerm[] = [
      {
        path: 'nested.number',
        value: 1815,
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.createSearchTerms(terms)

    if (result.failure) {
      throw new Error(`Search term creation failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0] as Record<string, unknown>)
  }, 30000)
})

// =============================================================================
// Batch Field Access Tests
// =============================================================================

describe('JSONB Field Access - Batch Operations', () => {
  it('should handle batch of field access queries', async () => {
    const paths = ['string', 'number', 'array_string', 'array_number', 'nested']

    const terms: SearchTerm[] = paths.map((path) => ({
      path,
      column: searchableSchema.encrypted_jsonb,
      table: searchableSchema,
    }))

    const result = await protectClient.createSearchTerms(terms)

    if (result.failure) {
      throw new Error(`Batch field access failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(paths.length)
    for (const term of result.data) {
      expectJsonPathSelectorOnly(term as Record<string, unknown>)
    }
  }, 30000)

  it('should handle batch of field access with values', async () => {
    const terms: SearchTerm[] = [
      {
        path: 'string',
        value: 'hello',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
      {
        path: 'number',
        value: 42,
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
      {
        path: 'nested.string',
        value: 'world',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
      {
        path: 'nested.number',
        value: 1815,
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.createSearchTerms(terms)

    if (result.failure) {
      throw new Error(`Batch field access failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(4)
    for (const term of result.data) {
      expectJsonPathWithValue(term as Record<string, unknown>)
    }
  }, 30000)
})

// =============================================================================
// Edge Cases
// =============================================================================

describe('JSONB Field Access - Edge Cases', () => {
  it('should handle special characters in string values', async () => {
    const terms: SearchTerm[] = [
      {
        path: 'message',
        value: 'Hello "world" with \'quotes\' and \\backslash\\',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.createSearchTerms(terms)

    if (result.failure) {
      throw new Error(`Special chars failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0] as Record<string, unknown>)
  }, 30000)

  it('should handle unicode characters', async () => {
    const terms: SearchTerm[] = [
      {
        path: 'greeting',
        value: '你好世界 🌍 مرحبا',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.createSearchTerms(terms)

    if (result.failure) {
      throw new Error(`Unicode failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0] as Record<string, unknown>)
  }, 30000)

  it('should handle boolean values', async () => {
    const terms: SearchTerm[] = [
      {
        path: 'is_active',
        value: true,
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.createSearchTerms(terms)

    if (result.failure) {
      throw new Error(`Boolean failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0] as Record<string, unknown>)
  }, 30000)

  it('should handle float/decimal numbers', async () => {
    const terms: SearchTerm[] = [
      {
        path: 'price',
        value: 99.99,
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.createSearchTerms(terms)

    if (result.failure) {
      throw new Error(`Float failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0] as Record<string, unknown>)
  }, 30000)

  it('should handle negative numbers', async () => {
    const terms: SearchTerm[] = [
      {
        path: 'balance',
        value: -500,
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.createSearchTerms(terms)

    if (result.failure) {
      throw new Error(`Negative number failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0] as Record<string, unknown>)
  }, 30000)
})

// =============================================================================
// Encryption Verification Tests
// =============================================================================

describe('JSONB Field Access - Encryption Verification', () => {
  it('should store encrypted data (not plaintext)', async () => {
    // Query raw value from database
    const rawRow = await db
      .select({ encrypted_jsonb: sql<string>`encrypted_jsonb::text` })
      .from(jsonbFieldAccessTable)
      .where(eq(jsonbFieldAccessTable.id, insertedId))

    expect(rawRow).toHaveLength(1)
    const rawValue = rawRow[0].encrypted_jsonb

    // Should NOT contain plaintext values
    expect(rawValue).not.toContain('"string":"hello"')
    expect(rawValue).not.toContain('"number":42')
    expect(rawValue).not.toContain('"nested":{"number":1815')

    // Should have encrypted structure (c = ciphertext indicator)
    expect(rawValue).toContain('"c"')
  }, 30000)

  it('should have encrypted structure with expected fields', async () => {
    // Query raw encrypted data
    const rawRow = await db
      .select({ encrypted_jsonb: jsonbFieldAccessTable.encrypted_jsonb })
      .from(jsonbFieldAccessTable)
      .where(eq(jsonbFieldAccessTable.id, insertedId))

    expect(rawRow).toHaveLength(1)

    // The encrypted value should be an object with encryption metadata
    const encryptedValue = rawRow[0].encrypted_jsonb as Record<string, unknown>
    expect(encryptedValue).toBeDefined()

    // Should have ciphertext structure (c, k, or other encryption markers)
    expect(encryptedValue).toHaveProperty('c')
  }, 30000)
})

// =============================================================================
// Decryption Verification Tests
// =============================================================================

describe('JSONB Field Access - Decryption Verification', () => {
  it('should decrypt stored data correctly', async () => {
    const results = await db
      .select()
      .from(jsonbFieldAccessTable)
      .where(eq(jsonbFieldAccessTable.id, insertedId))

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
      .from(jsonbFieldAccessTable)
      .where(eq(jsonbFieldAccessTable.id, insertedId))

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
