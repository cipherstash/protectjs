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

const jsonbPathOpsTable = pgTable('drizzle_jsonb_path_ops_test', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  encrypted_jsonb: encryptedType<StandardJsonbData>('encrypted_jsonb', {
    searchableJson: true,
  }),
  createdAt: timestamp('created_at').defaultNow(),
  testRunId: text('test_run_id'),
})

const pathOpsSchema = extractProtectSchema(jsonbPathOpsTable)

const searchableSchema = csTable('drizzle_jsonb_path_ops_test', {
  encrypted_jsonb: csColumn('encrypted_jsonb').searchableJson(),
})

// =============================================================================
// Test Setup
// =============================================================================

const { getProtectClient } = createJsonbTestSuite({
  tableName: 'path-ops',
  tableDefinition: jsonbPathOpsTable,
  schema: pathOpsSchema,
  additionalSchemas: [searchableSchema],
  testData: standardJsonbData,
  createTableSql: STANDARD_TABLE_SQL('drizzle_jsonb_path_ops_test'),
})

// =============================================================================
// jsonb_path_exists Tests
// =============================================================================

describe('JSONB Path Operations - jsonb_path_exists', () => {
  it('should generate path exists selector for number field', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'number',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Path exists failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0])
  }, 30000)

  it('should generate path exists selector for nested string', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'nested.string',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Path exists failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0])
  }, 30000)

  it('should generate path exists selector for nested object', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'nested',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Path exists failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0])
  }, 30000)

  it('should generate path exists selector for unknown path', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'unknown_path',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Path exists failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0])
  }, 30000)

  it('should generate path exists selector for array path', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'array_string',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Path exists failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0])
  }, 30000)
})

// =============================================================================
// jsonb_path_query Tests
// =============================================================================

describe('JSONB Path Operations - jsonb_path_query', () => {
  it('should generate path query with number value', async () => {
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
      throw new Error(`Path query failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0])
  }, 30000)

  it('should generate path query with nested string value', async () => {
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
      throw new Error(`Path query failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0])
  }, 30000)

  it('should generate path query selector for nested object', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'nested',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Path query failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0])
  }, 30000)

  it('should generate path query selector for unknown path (empty set return)', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'unknown_deep.path.that.does.not.exist',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Path query failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0])
  }, 30000)

  it('should generate path query with nested number value', async () => {
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
      throw new Error(`Path query failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0])
  }, 30000)
})

// =============================================================================
// jsonb_path_query_first Tests
// =============================================================================

describe('JSONB Path Operations - jsonb_path_query_first', () => {
  it('should generate path query first for array wildcard string', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'array_string[*]',
        value: 'hello',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Path query first failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0])
  }, 30000)

  it('should generate path query first for array wildcard number', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'array_number[*]',
        value: 42,
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Path query first failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0])
  }, 30000)

  it('should generate path query first for nested string', async () => {
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
      throw new Error(`Path query first failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0])
  }, 30000)

  it('should generate path query first selector for nested object', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'nested',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Path query first failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0])
  }, 30000)

  it('should generate path query first for unknown path (NULL return)', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'nonexistent_field_for_first',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Path query first failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0])
  }, 30000)

  it('should generate path query first with alternate wildcard notation', async () => {
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
      throw new Error(`Path query first failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0])
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

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Batch path exists failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(paths.length)
    for (const term of result.data) {
      expectJsonPathSelectorOnly(term)
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

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Batch path query failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(6)
    for (const term of result.data) {
      expectJsonPathWithValue(term)
    }
  }, 30000)

  it('should handle mixed path operations in batch', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'nested',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
      {
        path: 'string',
        value: 'hello',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
      {
        path: 'array_string[*]',
        value: 'world',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
      {
        path: 'unknown_field',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Mixed batch failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(4)
    expectJsonPathSelectorOnly(result.data[0])
    expectJsonPathWithValue(result.data[1])
    expectJsonPathWithValue(result.data[2])
    expectJsonPathSelectorOnly(result.data[3])
  }, 30000)
})

// =============================================================================
// Edge Cases
// =============================================================================

describe('JSONB Path Operations - Edge Cases', () => {
  it('should handle multiple array wildcards in path', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'matrix[@][@]',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Multiple wildcards failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0])
  }, 30000)

  it('should handle complex nested array path', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'users[@].orders[@].items[0].name',
        value: 'Widget',
        column: searchableSchema.encrypted_jsonb,
        table: searchableSchema,
      },
    ]

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Complex path failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0])
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

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Deep nesting failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0])
  }, 30000)

  it('should handle array index access', async () => {
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
      throw new Error(`Array index failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0])
  }, 30000)
})
