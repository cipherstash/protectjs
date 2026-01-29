/**
 * JSONB Path Operations Tests
 *
 * Tests for JSONB path query operations through Drizzle ORM.
 * These tests verify that the Drizzle integration correctly handles
 * encrypted JSONB path operations matching the proxy test patterns.
 *
 * Reference: .work/jsonb-test-coverage/proxy-tests-reference.md
 * - jsonb_path_exists.rs
 * - jsonb_path_query.rs
 * - jsonb_path_query_first.rs
 */
import 'dotenv/config'
import { protect, type QueryTerm } from '@cipherstash/protect'
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
 * Drizzle table with encrypted JSONB column for path operations testing
 */
const jsonbPathOpsTable = pgTable('drizzle_jsonb_path_ops_test', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  encrypted_jsonb: encryptedType<StandardJsonbData>('encrypted_jsonb', {
    searchableJson: true,
  }),
  createdAt: timestamp('created_at').defaultNow(),
  testRunId: text('test_run_id'),
})

// Extract Protect.js schema from Drizzle table
const pathOpsSchema = extractProtectSchema(jsonbPathOpsTable)

/**
 * Protect.js schema with searchableJson for creating search terms
 */
const searchableSchema = csTable('drizzle_jsonb_path_ops_test', {
  encrypted_jsonb: csColumn('encrypted_jsonb').searchableJson(),
})

// =============================================================================
// Test Setup
// =============================================================================

const TEST_RUN_ID = createTestRunId('path-ops')

let protectClient: Awaited<ReturnType<typeof protect>>
let db: ReturnType<typeof drizzle>
let insertedId: number

beforeAll(async () => {
  // Initialize Protect.js client
  protectClient = await protect({ schemas: [pathOpsSchema, searchableSchema] })

  const client = postgres(process.env.DATABASE_URL as string)
  db = drizzle({ client })

  // Drop and recreate test table to ensure correct column type
  await db.execute(sql`DROP TABLE IF EXISTS drizzle_jsonb_path_ops_test`)
  await db.execute(sql`
    CREATE TABLE drizzle_jsonb_path_ops_test (
      id SERIAL PRIMARY KEY,
      encrypted_jsonb eql_v2_encrypted,
      created_at TIMESTAMP DEFAULT NOW(),
      test_run_id TEXT
    )
  `)

  // Encrypt and insert standard test data
  const encrypted = await protectClient.encryptModel(
    { encrypted_jsonb: standardJsonbData },
    pathOpsSchema,
  )

  if (encrypted.failure) {
    throw new Error(`Encryption failed: ${encrypted.failure.message}`)
  }

  const inserted = await db
    .insert(jsonbPathOpsTable)
    .values({
      ...encrypted.data,
      testRunId: TEST_RUN_ID,
    })
    .returning({ id: jsonbPathOpsTable.id })

  insertedId = inserted[0].id
}, 60000)

afterAll(async () => {
  // Clean up test data
  await db
    .delete(jsonbPathOpsTable)
    .where(eq(jsonbPathOpsTable.testRunId, TEST_RUN_ID))
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
 * Path+value queries return { sv: [...] } with the ste_vec entries
 */
function expectJsonPathWithValue(term: Record<string, unknown>): void {
  expect(term).toHaveProperty('sv')
  expect(Array.isArray(term.sv)).toBe(true)
  const sv = term.sv as Array<Record<string, unknown>>
  expect(sv.length).toBeGreaterThan(0)
}

// =============================================================================
// jsonb_path_exists Tests
// =============================================================================

describe('JSONB Path Operations - jsonb_path_exists', () => {
  it('should generate path exists selector for number field', async () => {
    // SQL: jsonb_path_exists(encrypted_jsonb, '$.number')
    const terms: QueryTerm[] = [
      {
        path: 'number',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Path exists failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0] as Record<string, unknown>)
  }, 30000)

  it('should generate path exists selector for nested string', async () => {
    // SQL: jsonb_path_exists(encrypted_jsonb, '$.nested.string')
    const terms: QueryTerm[] = [
      {
        path: 'nested.string',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Path exists failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0] as Record<string, unknown>)
  }, 30000)

  it('should generate path exists selector for nested object', async () => {
    // SQL: jsonb_path_exists(encrypted_jsonb, '$.nested')
    const terms: QueryTerm[] = [
      {
        path: 'nested',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Path exists failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0] as Record<string, unknown>)
  }, 30000)

  it('should generate path exists selector for unknown path', async () => {
    // SQL: jsonb_path_exists(encrypted_jsonb, '$.vtha') -> false
    // Client generates selector, proxy determines existence
    const terms: QueryTerm[] = [
      {
        path: 'unknown_path',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Path exists failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0] as Record<string, unknown>)
  }, 30000)

  it('should generate path exists selector for array path', async () => {
    // SQL: jsonb_path_exists(encrypted_jsonb, '$.array_string')
    const terms: QueryTerm[] = [
      {
        path: 'array_string',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Path exists failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0] as Record<string, unknown>)
  }, 30000)
})

// =============================================================================
// jsonb_path_query Tests
// =============================================================================

describe('JSONB Path Operations - jsonb_path_query', () => {
  it('should generate path query with number value', async () => {
    // SQL: jsonb_path_query(encrypted_jsonb, '$.number')
    const terms: QueryTerm[] = [
      {
        path: 'number',
        value: 42,
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Path query failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0] as Record<string, unknown>)
  }, 30000)

  it('should generate path query with nested string value', async () => {
    // SQL: jsonb_path_query(encrypted_jsonb, '$.nested.string')
    const terms: QueryTerm[] = [
      {
        path: 'nested.string',
        value: 'world',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Path query failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0] as Record<string, unknown>)
  }, 30000)

  it('should generate path query selector for nested object', async () => {
    // SQL: jsonb_path_query(encrypted_jsonb, '$.nested')
    const terms: QueryTerm[] = [
      {
        path: 'nested',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Path query failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0] as Record<string, unknown>)
  }, 30000)

  it('should generate path query selector for unknown path (empty set return)', async () => {
    // SQL: jsonb_path_query(encrypted_jsonb, '$.vtha')
    // Proxy returns empty set when path doesn't exist
    const terms: QueryTerm[] = [
      {
        path: 'unknown_deep.path.that.does.not.exist',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Path query failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0] as Record<string, unknown>)
  }, 30000)

  it('should generate path query with nested number value', async () => {
    // SQL: jsonb_path_query(encrypted_jsonb, '$.nested.number')
    const terms: QueryTerm[] = [
      {
        path: 'nested.number',
        value: 1815,
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Path query failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0] as Record<string, unknown>)
  }, 30000)
})

// =============================================================================
// jsonb_path_query_first Tests
// =============================================================================

describe('JSONB Path Operations - jsonb_path_query_first', () => {
  it('should generate path query first for array wildcard string', async () => {
    // SQL: jsonb_path_query_first(encrypted_jsonb, '$.array_string[*]')
    const terms: QueryTerm[] = [
      {
        path: 'array_string[*]',
        value: 'hello',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Path query first failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0] as Record<string, unknown>)
  }, 30000)

  it('should generate path query first for array wildcard number', async () => {
    // SQL: jsonb_path_query_first(encrypted_jsonb, '$.array_number[*]')
    const terms: QueryTerm[] = [
      {
        path: 'array_number[*]',
        value: 42,
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Path query first failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0] as Record<string, unknown>)
  }, 30000)

  it('should generate path query first for nested string', async () => {
    // SQL: jsonb_path_query_first(encrypted_jsonb, '$.nested.string')
    const terms: QueryTerm[] = [
      {
        path: 'nested.string',
        value: 'world',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Path query first failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0] as Record<string, unknown>)
  }, 30000)

  it('should generate path query first selector for nested object', async () => {
    // SQL: jsonb_path_query_first(encrypted_jsonb, '$.nested')
    const terms: QueryTerm[] = [
      {
        path: 'nested',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Path query first failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0] as Record<string, unknown>)
  }, 30000)

  it('should generate path query first for unknown path (NULL return)', async () => {
    // SQL: jsonb_path_query_first(encrypted_jsonb, '$.unknown_field')
    // Proxy returns NULL when path doesn't exist
    const terms: QueryTerm[] = [
      {
        path: 'nonexistent_field_for_first',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Path query first failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0] as Record<string, unknown>)
  }, 30000)

  it('should generate path query first with alternate wildcard notation', async () => {
    // SQL: jsonb_path_query_first(encrypted_jsonb, '$.array_string[@]')
    const terms: QueryTerm[] = [
      {
        path: 'array_string[@]',
        value: 'hello',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Path query first failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0] as Record<string, unknown>)
  }, 30000)
})

// =============================================================================
// Batch Path Operations Tests
// =============================================================================

describe('JSONB Path Operations - Batch Operations', () => {
  it('should handle batch of path exists queries', async () => {
    const paths = [
      'number',
      'string',
      'nested',
      'nested.string',
      'nested.number',
      'array_string',
      'array_number',
    ]

    const terms: QueryTerm[] = paths.map((path) => ({
      path,
      column: searchableSchema.encrypted_jsonb,
      table: searchableSchema,
    }))

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Batch path exists failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(paths.length)
    for (const term of result.data) {
      expectJsonPathSelectorOnly(term as Record<string, unknown>)
    }
  }, 30000)

  it('should handle batch of path queries with values', async () => {
    const terms: QueryTerm[] = [
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

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Batch path query failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(6)
    for (const term of result.data) {
      expectJsonPathWithValue(term as Record<string, unknown>)
    }
  }, 30000)

  it('should handle mixed path operations in batch', async () => {
    const terms: QueryTerm[] = [
      // Path exists (no value)
      {
        path: 'nested',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
      // Path query with value
      {
        path: 'string',
        value: 'hello',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
      // Path query first with wildcard
      {
        path: 'array_string[*]',
        value: 'world',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
      // Unknown path
      {
        path: 'unknown_field',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Mixed batch failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(4)
    // First and last are selector-only, middle two have values
    expectJsonPathSelectorOnly(result.data[0] as Record<string, unknown>)
    expectJsonPathWithValue(result.data[1] as Record<string, unknown>)
    expectJsonPathWithValue(result.data[2] as Record<string, unknown>)
    expectJsonPathSelectorOnly(result.data[3] as Record<string, unknown>)
  }, 30000)
})

// =============================================================================
// Edge Cases
// =============================================================================

describe('JSONB Path Operations - Edge Cases', () => {
  it('should handle multiple array wildcards in path', async () => {
    // SQL pattern: $.matrix[*][*]
    const terms: QueryTerm[] = [
      {
        path: 'matrix[@][@]',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Multiple wildcards failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0] as Record<string, unknown>)
  }, 30000)

  it('should handle complex nested array path', async () => {
    // SQL pattern: $.users[*].orders[*].items[0].name
    const terms: QueryTerm[] = [
      {
        path: 'users[@].orders[@].items[0].name',
        value: 'Widget',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Complex path failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0] as Record<string, unknown>)
  }, 30000)

  it('should handle very deep nesting (10+ levels)', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'a.b.c.d.e.f.g.h.i.j.k.l',
        value: 'deep_value',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Deep nesting failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0] as Record<string, unknown>)
  }, 30000)

  it('should handle array index access', async () => {
    // Access specific array index: $.array_string[0]
    const terms: QueryTerm[] = [
      {
        path: 'array_string[0]',
        value: 'hello',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Array index failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0] as Record<string, unknown>)
  }, 30000)
})

// =============================================================================
// Encryption Verification Tests
// =============================================================================

describe('JSONB Path Operations - Encryption Verification', () => {
  it('should store encrypted data (not plaintext)', async () => {
    // Query raw value from database
    const rawRow = await db
      .select({ encrypted_jsonb: sql<string>`encrypted_jsonb::text` })
      .from(jsonbPathOpsTable)
      .where(eq(jsonbPathOpsTable.id, insertedId))

    expect(rawRow).toHaveLength(1)
    const rawValue = rawRow[0].encrypted_jsonb

    // Should NOT contain plaintext values from standardJsonbData
    expect(rawValue).not.toContain('"string":"hello"')
    expect(rawValue).not.toContain('"number":42')
    expect(rawValue).not.toContain('"nested":{"number":1815')

    // Should have encrypted structure (c = ciphertext indicator)
    expect(rawValue).toContain('"c"')
  }, 30000)

  it('should have encrypted structure with expected fields', async () => {
    // Query raw encrypted data
    const rawRow = await db
      .select({ encrypted_jsonb: jsonbPathOpsTable.encrypted_jsonb })
      .from(jsonbPathOpsTable)
      .where(eq(jsonbPathOpsTable.id, insertedId))

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

describe('JSONB Path Operations - Decryption Verification', () => {
  it('should decrypt stored data correctly', async () => {
    const results = await db
      .select()
      .from(jsonbPathOpsTable)
      .where(eq(jsonbPathOpsTable.id, insertedId))

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
      .from(jsonbPathOpsTable)
      .where(eq(jsonbPathOpsTable.id, insertedId))

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
