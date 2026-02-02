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
 *
 * Note: Encryption/decryption verification and Pattern B E2E tests have been
 * consolidated into separate files to eliminate duplication.
 * See: encryption-verification.test.ts and pattern-b-e2e.test.ts
 */
import 'dotenv/config'
import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { encryptedType, extractProtectSchema } from '../../src/pg'
import {
  containmentVariations,
  standardJsonbData,
  type StandardJsonbData,
} from '../fixtures/jsonb-test-data'
import {
  createJsonbTestSuite,
  STANDARD_TABLE_SQL,
} from '../helpers/jsonb-test-setup'
import { expectContainmentTerm } from '../helpers/jsonb-query-helpers'

// =============================================================================
// Schema Definitions
// =============================================================================

const jsonbContainmentTable = pgTable('drizzle_jsonb_containment_test', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  encrypted_jsonb: encryptedType<StandardJsonbData>('encrypted_jsonb', {
    searchableJson: true,
  }),
  createdAt: timestamp('created_at').defaultNow(),
  testRunId: text('test_run_id'),
})

const containmentSchema = extractProtectSchema(jsonbContainmentTable)

// =============================================================================
// Test Setup
// =============================================================================

const { getProtectClient } = createJsonbTestSuite({
  tableName: 'containment',
  tableDefinition: jsonbContainmentTable,
  schema: containmentSchema,
  testData: standardJsonbData,
  createTableSql: STANDARD_TABLE_SQL('drizzle_jsonb_containment_test'),
})

// =============================================================================
// Contains (@>) Operator Tests
// =============================================================================

describe('JSONB Containment - Contains (@>) via Drizzle', () => {
  it('should generate containment search term for string value', async () => {
    const result = await getProtectClient().encryptQuery([
      {
        contains: containmentVariations.stringOnly,
        column: containmentSchema.encrypted_jsonb,
        table: containmentSchema,
      },
    ])

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectContainmentTerm(result.data[0])
  }, 30000)

  it('should generate containment search term for number value', async () => {
    const result = await getProtectClient().encryptQuery([
      {
        contains: containmentVariations.numberOnly,
        column: containmentSchema.encrypted_jsonb,
        table: containmentSchema,
      },
    ])

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectContainmentTerm(result.data[0])
  }, 30000)

  it('should generate containment search term for string array', async () => {
    const result = await getProtectClient().encryptQuery([
      {
        contains: containmentVariations.stringArray,
        column: containmentSchema.encrypted_jsonb,
        table: containmentSchema,
      },
    ])

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectContainmentTerm(result.data[0])
  }, 30000)

  it('should generate containment search term for numeric array', async () => {
    const result = await getProtectClient().encryptQuery([
      {
        contains: containmentVariations.numberArray,
        column: containmentSchema.encrypted_jsonb,
        table: containmentSchema,
      },
    ])

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectContainmentTerm(result.data[0])
  }, 30000)

  it('should generate containment search term for nested object', async () => {
    const result = await getProtectClient().encryptQuery([
      {
        contains: containmentVariations.nestedFull,
        column: containmentSchema.encrypted_jsonb,
        table: containmentSchema,
      },
    ])

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectContainmentTerm(result.data[0])
  }, 30000)

  it('should generate containment search term for partial nested object', async () => {
    const result = await getProtectClient().encryptQuery([
      {
        contains: containmentVariations.nestedPartial,
        column: containmentSchema.encrypted_jsonb,
        table: containmentSchema,
      },
    ])

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectContainmentTerm(result.data[0])
  }, 30000)
})

// =============================================================================
// Contained By (<@) Operator Tests
// =============================================================================

describe('JSONB Containment - Contained By (<@) via Drizzle', () => {
  it('should generate contained_by search term for string value', async () => {
    const result = await getProtectClient().encryptQuery([
      {
        containedBy: containmentVariations.stringOnly,
        column: containmentSchema.encrypted_jsonb,
        table: containmentSchema,
      },
    ])

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectContainmentTerm(result.data[0])
  }, 30000)

  it('should generate contained_by search term for number value', async () => {
    const result = await getProtectClient().encryptQuery([
      {
        containedBy: containmentVariations.numberOnly,
        column: containmentSchema.encrypted_jsonb,
        table: containmentSchema,
      },
    ])

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectContainmentTerm(result.data[0])
  }, 30000)

  it('should generate contained_by search term for string array', async () => {
    const result = await getProtectClient().encryptQuery([
      {
        containedBy: containmentVariations.stringArray,
        column: containmentSchema.encrypted_jsonb,
        table: containmentSchema,
      },
    ])

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectContainmentTerm(result.data[0])
  }, 30000)

  it('should generate contained_by search term for numeric array', async () => {
    const result = await getProtectClient().encryptQuery([
      {
        containedBy: containmentVariations.numberArray,
        column: containmentSchema.encrypted_jsonb,
        table: containmentSchema,
      },
    ])

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectContainmentTerm(result.data[0])
  }, 30000)

  it('should generate contained_by search term for nested object', async () => {
    const result = await getProtectClient().encryptQuery([
      {
        containedBy: containmentVariations.nestedFull,
        column: containmentSchema.encrypted_jsonb,
        table: containmentSchema,
      },
    ])

    if (result.failure) {
      throw new Error(`Query encryption failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectContainmentTerm(result.data[0])
  }, 30000)
})

// =============================================================================
// Batch Containment Tests (Large Dataset Pattern)
// =============================================================================

describe('JSONB Containment - Batch Operations', () => {
  it('should handle batch of containment queries', async () => {
    const terms = Array.from({ length: 20 }, (_, i) => ({
      contains: { [`key_${i}`]: `value_${i}` },
      column: containmentSchema.encrypted_jsonb,
      table: containmentSchema,
    }))

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Batch containment failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(20)
    for (const term of result.data) {
      expectContainmentTerm(term)
    }
  }, 60000)

  it('should handle mixed contains and contained_by batch', async () => {
    const containsTerms = Array.from({ length: 10 }, (_, i) => ({
      contains: { field: `contains_${i}` },
      column: containmentSchema.encrypted_jsonb,
      table: containmentSchema,
    }))

    const containedByTerms = Array.from({ length: 10 }, (_, i) => ({
      containedBy: { field: `contained_by_${i}` },
      column: containmentSchema.encrypted_jsonb,
      table: containmentSchema,
    }))

    const result = await getProtectClient().encryptQuery([
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

    const result = await getProtectClient().encryptQuery([
      {
        contains: complexObject,
        column: containmentSchema.encrypted_jsonb,
        table: containmentSchema,
      },
    ])

    if (result.failure) {
      throw new Error(`Complex containment failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectContainmentTerm(result.data[0])

    const svResult = result.data[0] as { sv: unknown[] }
    expect(svResult.sv.length).toBeGreaterThan(5)
  }, 30000)

  it('should handle array containment with many elements', async () => {
    const largeArray = Array.from({ length: 50 }, (_, i) => `item_${i}`)

    const result = await getProtectClient().encryptQuery([
      {
        contains: { items: largeArray },
        column: containmentSchema.encrypted_jsonb,
        table: containmentSchema,
      },
    ])

    if (result.failure) {
      throw new Error(`Array containment failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectContainmentTerm(result.data[0])

    const svResult = result.data[0] as { sv: unknown[] }
    expect(svResult.sv.length).toBeGreaterThanOrEqual(50)
  }, 30000)

  it('should handle containment with various numeric values', async () => {
    const numericValues = [0, 1, -1, 42, 100, -500, 0.5, -0.5, 999999]

    const terms = numericValues.map((num) => ({
      contains: { count: num },
      column: containmentSchema.encrypted_jsonb,
      table: containmentSchema,
    }))

    const result = await getProtectClient().encryptQuery(terms)

    if (result.failure) {
      throw new Error(`Numeric containment failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(numericValues.length)
    for (const term of result.data) {
      expectContainmentTerm(term)
    }
  }, 30000)
})

// =============================================================================
// Edge Cases
// =============================================================================

describe('JSONB Containment - Edge Cases', () => {
  it('should handle empty object containment', async () => {
    const result = await getProtectClient().encryptQuery([
      {
        contains: {},
        column: containmentSchema.encrypted_jsonb,
        table: containmentSchema,
      },
    ])

    if (result.failure) {
      throw new Error(`Empty object containment failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
  }, 30000)

  it('should handle null value in containment object', async () => {
    const result = await getProtectClient().encryptQuery([
      {
        contains: { nullable_field: null },
        column: containmentSchema.encrypted_jsonb,
        table: containmentSchema,
      },
    ])

    if (result.failure) {
      throw new Error(`Null containment failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectContainmentTerm(result.data[0])
  }, 30000)

  it('should handle multiple field containment', async () => {
    const result = await getProtectClient().encryptQuery([
      {
        contains: containmentVariations.multipleFields,
        column: containmentSchema.encrypted_jsonb,
        table: containmentSchema,
      },
    ])

    if (result.failure) {
      throw new Error(`Multiple field containment failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectContainmentTerm(result.data[0])
  }, 30000)

  it('should handle large containment object (50+ keys)', async () => {
    const largeObject: Record<string, string> = {}
    for (let i = 0; i < 50; i++) {
      largeObject[`key${i}`] = `value${i}`
    }

    const result = await getProtectClient().encryptQuery([
      {
        contains: largeObject,
        column: containmentSchema.encrypted_jsonb,
        table: containmentSchema,
      },
    ])

    if (result.failure) {
      throw new Error(`Large object containment failed: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectContainmentTerm(result.data[0])

    const svResult = result.data[0] as { sv: unknown[] }
    expect(svResult.sv.length).toBeGreaterThanOrEqual(50)
  }, 30000)
})
