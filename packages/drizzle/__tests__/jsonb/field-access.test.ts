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
} from '../helpers/jsonb-query-helpers'

// =============================================================================
// Schema Definitions
// =============================================================================

const jsonbFieldAccessTable = pgTable('drizzle_jsonb_field_access_test', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  encrypted_jsonb: encryptedType<StandardJsonbData>('encrypted_jsonb', {
    searchableJson: true,
  }),
  createdAt: timestamp('created_at').defaultNow(),
  testRunId: text('test_run_id'),
})

const fieldAccessSchema = extractProtectSchema(jsonbFieldAccessTable)

const searchableSchema = csTable('drizzle_jsonb_field_access_test', {
  encrypted_jsonb: csColumn('encrypted_jsonb').searchableJson(),
})

// =============================================================================
// Test Setup
// =============================================================================

const { getProtectClient } = createJsonbTestSuite({
  tableName: 'field-access',
  tableDefinition: jsonbFieldAccessTable,
  schema: fieldAccessSchema,
  additionalSchemas: [searchableSchema],
  testData: standardJsonbData,
  createTableSql: STANDARD_TABLE_SQL('drizzle_jsonb_field_access_test'),
})

// =============================================================================
// Field Access Tests - Direct Arrow Operator
// =============================================================================

describe('JSONB Field Access - Direct Arrow Operator', () => {
  it('should generate selector for string field', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'string',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0])
  }, 30000)

  it('should generate selector for numeric field', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'number',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0])
  }, 30000)

  it('should generate selector for numeric array field', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'array_number',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0])
  }, 30000)

  it('should generate selector for string array field', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'array_string',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0])
  }, 30000)

  it('should generate selector for nested object field', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'nested',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0])
  }, 30000)

  it('should generate selector for deep nested path', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'nested.string',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0])
  }, 30000)

  it('should generate selector for unknown field (returns null in SQL)', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'unknown_field',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0])
  }, 30000)
})

// =============================================================================
// Field Access Tests - Selector Format Flexibility
// =============================================================================

describe('JSONB Field Access - Selector Format Flexibility', () => {
  it('should accept simple field name format', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'string',
        value: 'hello',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0])
  }, 30000)

  it('should accept nested field dot notation', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'nested.string',
        value: 'world',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0])
  }, 30000)

  it('should accept path as array format', async () => {
    const terms: QueryTerm[] = [
      {
        path: ['nested', 'string'],
        value: 'world',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0])
  }, 30000)

  it('should accept very deep nested paths', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'a.b.c.d.e.f.g.h.i.j',
        value: 'deep_value',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0])
  }, 30000)
})

// =============================================================================
// Field Access Tests - With Values
// =============================================================================

describe('JSONB Field Access - Path with Value Matching', () => {
  it('should generate search term for string field with value', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'string',
        value: 'hello',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0])
  }, 30000)

  it('should generate search term for numeric field with value', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'number',
        value: 42,
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0])
  }, 30000)

  it('should generate search term for nested string with value', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'nested.string',
        value: 'world',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0])
  }, 30000)

  it('should generate search term for nested number with value', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'nested.number',
        value: 1815,
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0])
  }, 30000)
})

// =============================================================================
// Batch Field Access Tests
// =============================================================================

describe('JSONB Field Access - Batch Operations', () => {
  it('should handle batch of field access queries', async () => {
    const paths = ['string', 'number', 'array_string', 'array_number', 'nested']

    const terms: QueryTerm[] = paths.map((path) => ({
      path,
      column: searchableSchema.encrypted_jsonb,
      table: searchableSchema,
    }))

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Batch field access failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(paths.length)
    for (const term of result.data) {
      expectJsonPathSelectorOnly(term)
    }
  }, 30000)

  it('should handle batch of field access with values', async () => {
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
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Batch field access failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(4)
    for (const term of result.data) {
      expectJsonPathWithValue(term)
    }
  }, 30000)
})

// =============================================================================
// Edge Cases
// =============================================================================

describe('JSONB Field Access - Edge Cases', () => {
  it('should handle special characters in string values', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'message',
        value: 'Hello "world" with \'quotes\' and \\backslash\\',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Special chars failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0])
  }, 30000)

  it('should handle unicode characters', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'greeting',
        value: '你好世界 🌍 مرحبا',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Unicode failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0])
  }, 30000)

  it('should handle boolean values', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'is_active',
        value: true,
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Boolean failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0])
  }, 30000)

  it('should handle float/decimal numbers', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'price',
        value: 99.99,
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Float failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0])
  }, 30000)

  it('should handle negative numbers', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'balance',
        value: -500,
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Negative number failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0])
  }, 30000)
})
