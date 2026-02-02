/**
 * Consolidated JSONB Encryption Verification Tests
 *
 * Tests that encrypted JSONB data is properly stored (not plaintext) and can be
 * correctly decrypted. Uses describe.each to run identical verification tests
 * against all operation types, eliminating duplication across 5 test files.
 *
 * Test patterns:
 * - Encryption Verification: Data is stored encrypted, not as plaintext
 * - Decryption Verification: Data can be decrypted back to original values
 * - Self-Verification: Encrypted data contains itself (e @> e)
 */
import 'dotenv/config'
import { protect } from '@cipherstash/protect'
import { csColumn, csTable } from '@cipherstash/schema'
import { and, eq, sql } from 'drizzle-orm'
import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { encryptedType, extractProtectSchema } from '../../src/pg'
import {
  comparisonTestData,
  createTestRunId,
  standardJsonbData,
  type ComparisonTestData,
  type StandardJsonbData,
} from '../fixtures/jsonb-test-data'
import {
  expectCiphertextProperty,
  expectEncryptedStructure,
  expectNoPlaintext,
} from '../helpers/jsonb-query-helpers'

if (!process.env.DATABASE_URL) {
  throw new Error('Missing env.DATABASE_URL')
}

// =============================================================================
// Table Definitions for Each Operation Type
// =============================================================================

const arrayOpsTable = pgTable('drizzle_jsonb_array_ops_verify', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  encrypted_jsonb: encryptedType<StandardJsonbData>('encrypted_jsonb', {
    searchableJson: true,
  }),
  createdAt: timestamp('created_at').defaultNow(),
  testRunId: text('test_run_id'),
})

const comparisonTable = pgTable('drizzle_jsonb_comparison_verify', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  encrypted_jsonb: encryptedType<ComparisonTestData>('encrypted_jsonb', {
    searchableJson: true,
  }),
  createdAt: timestamp('created_at').defaultNow(),
  testRunId: text('test_run_id'),
})

const containmentTable = pgTable('drizzle_jsonb_containment_verify', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  encrypted_jsonb: encryptedType<StandardJsonbData>('encrypted_jsonb', {
    searchableJson: true,
  }),
  createdAt: timestamp('created_at').defaultNow(),
  testRunId: text('test_run_id'),
})

const fieldAccessTable = pgTable('drizzle_jsonb_field_access_verify', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  encrypted_jsonb: encryptedType<StandardJsonbData>('encrypted_jsonb', {
    searchableJson: true,
  }),
  createdAt: timestamp('created_at').defaultNow(),
  testRunId: text('test_run_id'),
})

const pathOpsTable = pgTable('drizzle_jsonb_path_ops_verify', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  encrypted_jsonb: encryptedType<StandardJsonbData>('encrypted_jsonb', {
    searchableJson: true,
  }),
  createdAt: timestamp('created_at').defaultNow(),
  testRunId: text('test_run_id'),
})

// Extract schemas
const arrayOpsSchema = extractProtectSchema(arrayOpsTable)
const comparisonSchema = extractProtectSchema(comparisonTable)
const containmentSchema = extractProtectSchema(containmentTable)
const fieldAccessSchema = extractProtectSchema(fieldAccessTable)
const pathOpsSchema = extractProtectSchema(pathOpsTable)

// =============================================================================
// Test Configuration
// =============================================================================

interface TestConfig {
  name: string
  table: typeof arrayOpsTable
  schema: ReturnType<typeof extractProtectSchema>
  testData: unknown
  isMultiRow: boolean
  plaintextChecks: string[]
}

const testConfigs: TestConfig[] = [
  {
    name: 'Array Operations',
    table: arrayOpsTable,
    schema: arrayOpsSchema,
    testData: standardJsonbData,
    isMultiRow: false,
    plaintextChecks: [
      '"array_string":["hello","world"]',
      '"array_number":[42,84]',
      '"string":"hello"',
    ],
  },
  {
    name: 'Comparison',
    table: comparisonTable,
    schema: comparisonSchema,
    testData: comparisonTestData,
    isMultiRow: true,
    plaintextChecks: ['"string":"A"', '"number":1'],
  },
  {
    name: 'Containment',
    table: containmentTable,
    schema: containmentSchema,
    testData: standardJsonbData,
    isMultiRow: false,
    plaintextChecks: ['"string":"hello"', '"number":42'],
  },
  {
    name: 'Field Access',
    table: fieldAccessTable,
    schema: fieldAccessSchema,
    testData: standardJsonbData,
    isMultiRow: false,
    plaintextChecks: ['"string":"hello"', '"number":42', '"nested":{"number":1815'],
  },
  {
    name: 'Path Operations',
    table: pathOpsTable,
    schema: pathOpsSchema,
    testData: standardJsonbData,
    isMultiRow: false,
    plaintextChecks: ['"string":"hello"', '"number":42'],
  },
]

// =============================================================================
// Test Setup
// =============================================================================

const TEST_RUN_ID = createTestRunId('encryption-verify')

let protectClient: Awaited<ReturnType<typeof protect>>
let db: ReturnType<typeof drizzle>
const insertedIds: Map<string, number[]> = new Map()

beforeAll(async () => {
  // Initialize Protect.js client with all schemas
  protectClient = await protect({
    schemas: testConfigs.map((c) => c.schema),
  })

  const client = postgres(process.env.DATABASE_URL as string)
  db = drizzle({ client })

  // Create all tables and insert test data
  for (const config of testConfigs) {
    const tableName = (config.table as any)[Symbol.for('drizzle:Name')]

    // Drop and recreate table
    await db.execute(sql.raw(`DROP TABLE IF EXISTS ${tableName}`))
    await db.execute(sql.raw(`
      CREATE TABLE ${tableName} (
        id SERIAL PRIMARY KEY,
        encrypted_jsonb eql_v2_encrypted,
        created_at TIMESTAMP DEFAULT NOW(),
        test_run_id TEXT
      )
    `))

    // Insert test data
    const ids: number[] = []
    const dataArray = Array.isArray(config.testData)
      ? config.testData
      : [config.testData]

    for (const data of dataArray) {
      const encrypted = await protectClient.encryptModel(
        { encrypted_jsonb: data },
        config.schema,
      )

      if (encrypted.failure) {
        throw new Error(`Encryption failed for ${config.name}: ${encrypted.failure.message}`)
      }

      const inserted = await db
        .insert(config.table)
        .values({
          ...encrypted.data,
          testRunId: TEST_RUN_ID,
        } as any)
        .returning({ id: config.table.id })

      ids.push(inserted[0].id)
    }

    insertedIds.set(config.name, ids)
  }
}, 120000)

afterAll(async () => {
  // Clean up all test data
  for (const config of testConfigs) {
    await db.delete(config.table).where(eq(config.table.testRunId, TEST_RUN_ID))
  }
}, 60000)

// =============================================================================
// Parameterized Tests
// =============================================================================

describe.each(testConfigs)('$name - Encryption Verification', ({ name, table, plaintextChecks }) => {
  it('should store encrypted data (not plaintext)', async () => {
    const ids = insertedIds.get(name)!
    const rawRow = await db
      .select({ encrypted_jsonb: sql<string>`encrypted_jsonb::text` })
      .from(table)
      .where(eq(table.id, ids[0]))

    expect(rawRow).toHaveLength(1)
    const rawValue = rawRow[0].encrypted_jsonb

    // Should NOT contain plaintext values
    expectNoPlaintext(rawValue, plaintextChecks)

    // Should have encrypted structure
    expectEncryptedStructure(rawValue)
  }, 30000)

  it('should have encrypted structure with expected fields', async () => {
    const ids = insertedIds.get(name)!
    const rawRow = await db
      .select({ encrypted_jsonb: table.encrypted_jsonb })
      .from(table)
      .where(eq(table.id, ids[0]))

    expect(rawRow).toHaveLength(1)
    expectCiphertextProperty(rawRow[0].encrypted_jsonb)
  }, 30000)
})

describe.each(testConfigs)('$name - Decryption Verification', ({ name, table, testData, isMultiRow }) => {
  it('should decrypt stored data correctly', async () => {
    const ids = insertedIds.get(name)!
    const results = await db
      .select()
      .from(table)
      .where(eq(table.id, ids[0]))

    expect(results).toHaveLength(1)

    const decrypted = await protectClient.decryptModel(results[0])
    if (decrypted.failure) {
      throw new Error(`Decryption failed: ${decrypted.failure.message}`)
    }

    const decryptedJsonb = decrypted.data.encrypted_jsonb
    expect(decryptedJsonb).toBeDefined()

    // Verify against expected data
    const expectedData = isMultiRow
      ? (testData as unknown[])[0]
      : testData
    expect(decryptedJsonb).toEqual(expectedData)
  }, 30000)

  it('should round-trip encrypt and decrypt preserving all fields', async () => {
    const ids = insertedIds.get(name)!
    const results = await db
      .select()
      .from(table)
      .where(eq(table.id, ids[0]))

    const decrypted = await protectClient.decryptModel(results[0])
    if (decrypted.failure) {
      throw new Error(`Decryption failed: ${decrypted.failure.message}`)
    }

    const expectedData = isMultiRow
      ? (testData as unknown[])[0]
      : testData
    expect(decrypted.data.encrypted_jsonb).toEqual(expectedData)
  }, 30000)
})

describe.each(testConfigs)('$name - Pattern A: Self-Verification', ({ name, table }) => {
  it('should find record with self-containment (e @> e)', async () => {
    const ids = insertedIds.get(name)!
    const results = await db
      .select()
      .from(table)
      .where(
        and(
          eq(table.testRunId, TEST_RUN_ID),
          sql`${table.encrypted_jsonb} @> ${table.encrypted_jsonb}`
        )
      )

    // Should find at least the first record
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.map((r) => r.id)).toContain(ids[0])
  }, 30000)

  // Common TODO for all operation types
  it.todo('should find record with extracted ste_vec containment (e @> (e -> sv))')
})

// Additional test for comparison multi-row verification
describe('Comparison - Multi-Row Decryption Verification', () => {
  it('should decrypt all comparison test rows correctly', async () => {
    const ids = insertedIds.get('Comparison')!
    const results = await db
      .select()
      .from(comparisonTable)
      .where(eq(comparisonTable.testRunId, TEST_RUN_ID))

    expect(results).toHaveLength(5)

    const decryptedResults = await protectClient.bulkDecryptModels(results)
    if (decryptedResults.failure) {
      throw new Error(`Bulk decryption failed: ${decryptedResults.failure.message}`)
    }

    // Sort by number to match original order
    const sortedDecrypted = decryptedResults.data.sort(
      (a, b) =>
        (a.encrypted_jsonb as { number: number }).number -
        (b.encrypted_jsonb as { number: number }).number
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
