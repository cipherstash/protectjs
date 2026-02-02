/**
 * JSONB E2E Test Helpers
 *
 * Reusable utilities for executing and verifying encrypted JSONB queries.
 * These helpers close the gap between query term generation and actual database execution.
 *
 * Two test patterns are supported:
 * - Pattern A (Self-Verification): Extract terms from stored data → Query → Verify finds record
 * - Pattern B (Contextual Query): Independently encrypt search value → Query → Verify finds record
 */
import type { protect } from '@cipherstash/protect'
import type { PgColumn, PgTableWithColumns } from 'drizzle-orm/pg-core'
import { and, eq, sql } from 'drizzle-orm'
import type { PgSelect } from 'drizzle-orm/pg-core'

type ProtectClient = Awaited<ReturnType<typeof protect>>
type DrizzleDB = ReturnType<typeof import('drizzle-orm/postgres-js').drizzle>

// =============================================================================
// Pattern A Helpers: Self-Verification (Extract from Stored Data)
// =============================================================================

/**
 * Execute self-containment query (e @> e)
 * Tests that encrypted value contains itself - guaranteed to work
 * This validates the stored data structure is correct.
 */
export async function executeSelfContainmentQuery<T>(
  db: DrizzleDB,
  table: PgTableWithColumns<any>,
  encryptedColumn: PgColumn,
  testRunId: string,
  testRunIdColumn: PgColumn,
): Promise<T[]> {
  return db
    .select()
    .from(table)
    .where(
      and(
        eq(testRunIdColumn, testRunId),
        sql`${encryptedColumn} @> ${encryptedColumn}`
      )
    ) as Promise<T[]>
}

/**
 * Execute inline extracted term containment (e @> (e -> 'sv'::text))
 * Extracts the ste_vec from stored data inline and queries with it.
 */
export async function executeExtractedSteVecContainmentQuery<T>(
  db: DrizzleDB,
  table: PgTableWithColumns<any>,
  encryptedColumn: PgColumn,
  testRunId: string,
  testRunIdColumn: PgColumn,
): Promise<T[]> {
  return db
    .select()
    .from(table)
    .where(
      and(
        eq(testRunIdColumn, testRunId),
        sql`${encryptedColumn} @> (${encryptedColumn} -> 'sv'::text)`
      )
    ) as Promise<T[]>
}

/**
 * Verify asymmetric containment - extracted term should NOT contain full value
 * This tests that (e -> 'sv'::text) @> e returns FALSE
 */
export async function executeAsymmetricContainmentQuery<T>(
  db: DrizzleDB,
  table: PgTableWithColumns<any>,
  encryptedColumn: PgColumn,
  testRunId: string,
  testRunIdColumn: PgColumn,
): Promise<T[]> {
  return db
    .select()
    .from(table)
    .where(
      and(
        eq(testRunIdColumn, testRunId),
        sql`(${encryptedColumn} -> 'sv'::text) @> ${encryptedColumn}`
      )
    ) as Promise<T[]>
}

/**
 * Execute self-equality query using HMAC
 * Tests that the HMAC of stored data matches its own 'hm' field
 * SQL: eql_v2.hmac_256(e) = (e -> 'hm')
 */
export async function executeSelfHmacEqualityQuery<T>(
  db: DrizzleDB,
  table: PgTableWithColumns<any>,
  encryptedColumn: PgColumn,
  testRunId: string,
  testRunIdColumn: PgColumn,
): Promise<T[]> {
  return db
    .select()
    .from(table)
    .where(
      and(
        eq(testRunIdColumn, testRunId),
        sql`eql_v2.hmac_256(${encryptedColumn}) = (${encryptedColumn} -> 'hm')::text`
      )
    ) as Promise<T[]>
}

// =============================================================================
// Pattern B Helpers: Contextual Query (Independent Encryption)
// =============================================================================

/**
 * Execute a containment query (@>) and return results
 * SQL: column @> encrypted_term::eql_v2_encrypted
 */
export async function executeContainmentQuery<T>(
  db: DrizzleDB,
  table: PgTableWithColumns<any>,
  encryptedColumn: PgColumn,
  encryptedTerm: unknown,
  testRunId: string,
  testRunIdColumn: PgColumn,
): Promise<T[]> {
  return db
    .select()
    .from(table)
    .where(
      and(
        eq(testRunIdColumn, testRunId),
        sql`${encryptedColumn} @> ${JSON.stringify(encryptedTerm)}::eql_v2_encrypted`
      )
    ) as Promise<T[]>
}

/**
 * Execute a contained-by query (<@) and return results
 * SQL: column <@ encrypted_term::eql_v2_encrypted
 */
export async function executeContainedByQuery<T>(
  db: DrizzleDB,
  table: PgTableWithColumns<any>,
  encryptedColumn: PgColumn,
  encryptedTerm: unknown,
  testRunId: string,
  testRunIdColumn: PgColumn,
): Promise<T[]> {
  return db
    .select()
    .from(table)
    .where(
      and(
        eq(testRunIdColumn, testRunId),
        sql`${encryptedColumn} <@ ${JSON.stringify(encryptedTerm)}::eql_v2_encrypted`
      )
    ) as Promise<T[]>
}

/**
 * Execute an equality query using HMAC comparison and return results
 * SQL: eql_v2.hmac_256(column) = encrypted_term->'hm'
 */
export async function executeEqualityQuery<T>(
  db: DrizzleDB,
  table: PgTableWithColumns<any>,
  encryptedColumn: PgColumn,
  encryptedTerm: unknown,
  testRunId: string,
  testRunIdColumn: PgColumn,
): Promise<T[]> {
  return db
    .select()
    .from(table)
    .where(
      and(
        eq(testRunIdColumn, testRunId),
        sql`eql_v2.hmac_256(${encryptedColumn}) = ${JSON.stringify(encryptedTerm)}::jsonb->>'hm'`
      )
    ) as Promise<T[]>
}

/**
 * Execute a range query (gt, gte, lt, lte) and return results
 * SQL: eql_v2.{operator}(column, encrypted_term::eql_v2_encrypted)
 */
export async function executeRangeQuery<T>(
  db: DrizzleDB,
  table: PgTableWithColumns<any>,
  encryptedColumn: PgColumn,
  encryptedTerm: unknown,
  operator: 'gt' | 'gte' | 'lt' | 'lte',
  testRunId: string,
  testRunIdColumn: PgColumn,
): Promise<T[]> {
  return db
    .select()
    .from(table)
    .where(
      and(
        eq(testRunIdColumn, testRunId),
        sql`eql_v2.${sql.raw(operator)}(${encryptedColumn}, ${JSON.stringify(encryptedTerm)}::eql_v2_encrypted)`
      )
    ) as Promise<T[]>
}

/**
 * Execute a path-based containment query for field access
 * SQL: column @> encrypted_term::eql_v2_encrypted (where term has path selector)
 */
export async function executePathContainmentQuery<T>(
  db: DrizzleDB,
  table: PgTableWithColumns<any>,
  encryptedColumn: PgColumn,
  encryptedTerm: unknown,
  testRunId: string,
  testRunIdColumn: PgColumn,
): Promise<T[]> {
  return db
    .select()
    .from(table)
    .where(
      and(
        eq(testRunIdColumn, testRunId),
        sql`${encryptedColumn} @> ${JSON.stringify(encryptedTerm)}::eql_v2_encrypted`
      )
    ) as Promise<T[]>
}

/**
 * Assert query results count and optionally verify IDs
 */
export function assertResultCount<T extends { id: number }>(
  results: T[],
  expectedCount: number,
  expectedIds?: number[],
): void {
  if (results.length !== expectedCount) {
    throw new Error(
      `Expected ${expectedCount} results but got ${results.length}. ` +
      `IDs returned: [${results.map(r => r.id).join(', ')}]`
    )
  }

  if (expectedIds) {
    const ids = results.map(r => r.id).sort((a, b) => a - b)
    const sortedExpected = [...expectedIds].sort((a, b) => a - b)

    if (JSON.stringify(ids) !== JSON.stringify(sortedExpected)) {
      throw new Error(
        `Expected IDs [${sortedExpected.join(', ')}] but got [${ids.join(', ')}]`
      )
    }
  }
}

/**
 * Decrypt results and return decrypted data
 */
export async function decryptResults<T>(
  protectClient: ProtectClient,
  results: T[],
): Promise<T[]> {
  if (results.length === 0) {
    return []
  }

  const decrypted = await protectClient.bulkDecryptModels(results)
  if (decrypted.failure) {
    throw new Error(`Decryption failed: ${decrypted.failure.message}`)
  }

  return decrypted.data as T[]
}

/**
 * Combined helper: execute containment query and verify results
 */
export async function testContainmentE2E<T extends { id: number; encrypted_jsonb?: any }>(
  protectClient: ProtectClient,
  db: DrizzleDB,
  table: PgTableWithColumns<any>,
  schema: any,
  containsValue: unknown,
  testRunId: string,
  expectedCount: number,
  verifyFn?: (decrypted: T) => void,
): Promise<T[]> {
  // Generate encrypted query term
  const encryptedTerm = await protectClient.encryptQuery([{
    contains: containsValue,
    column: schema.encrypted_jsonb,
    table: schema,
  }])

  if (encryptedTerm.failure) {
    throw new Error(`Query encryption failed: ${encryptedTerm.failure.message}`)
  }

  // Execute containment query
  const results = await executeContainmentQuery<T>(
    db,
    table,
    (table as any).encrypted_jsonb,
    encryptedTerm.data[0],
    testRunId,
    (table as any).testRunId
  )

  // Verify result count
  assertResultCount(results as any[], expectedCount)

  // Decrypt and verify if needed
  if (expectedCount > 0 && verifyFn) {
    const decrypted = await decryptResults(protectClient, results)
    verifyFn(decrypted[0])
  }

  return results
}

/**
 * Combined helper: execute equality query and verify results
 */
export async function testEqualityE2E<T extends { id: number; encrypted_jsonb?: any }>(
  protectClient: ProtectClient,
  db: DrizzleDB,
  table: PgTableWithColumns<any>,
  schema: any,
  columnKey: string,
  value: string | number,
  testRunId: string,
  expectedCount: number,
  verifyFn?: (decrypted: T) => void,
): Promise<T[]> {
  // Generate encrypted query term
  const encryptedTerm = await protectClient.encryptQuery(value, {
    column: schema[columnKey],
    table: schema,
    queryType: 'equality',
  })

  if (encryptedTerm.failure) {
    throw new Error(`Query encryption failed: ${encryptedTerm.failure.message}`)
  }

  // Execute equality query
  const results = await executeEqualityQuery<T>(
    db,
    table,
    (table as any).encrypted_jsonb,
    encryptedTerm.data,
    testRunId,
    (table as any).testRunId
  )

  // Verify result count
  assertResultCount(results as any[], expectedCount)

  // Decrypt and verify if needed
  if (expectedCount > 0 && verifyFn) {
    const decrypted = await decryptResults(protectClient, results)
    verifyFn(decrypted[0])
  }

  return results
}

/**
 * Combined helper: execute range query and verify results
 */
export async function testRangeE2E<T extends { id: number; encrypted_jsonb?: any }>(
  protectClient: ProtectClient,
  db: DrizzleDB,
  table: PgTableWithColumns<any>,
  schema: any,
  columnKey: string,
  value: string | number,
  operator: 'gt' | 'gte' | 'lt' | 'lte',
  testRunId: string,
  expectedCount: number,
  verifyFn?: (decryptedResults: T[]) => void,
): Promise<T[]> {
  // Generate encrypted query term
  const encryptedTerm = await protectClient.encryptQuery(value, {
    column: schema[columnKey],
    table: schema,
    queryType: 'orderAndRange',
  })

  if (encryptedTerm.failure) {
    throw new Error(`Query encryption failed: ${encryptedTerm.failure.message}`)
  }

  // Execute range query
  const results = await executeRangeQuery<T>(
    db,
    table,
    (table as any).encrypted_jsonb,
    encryptedTerm.data,
    operator,
    testRunId,
    (table as any).testRunId
  )

  // Verify result count
  assertResultCount(results as any[], expectedCount)

  // Decrypt and verify if needed
  if (expectedCount > 0 && verifyFn) {
    const decrypted = await decryptResults(protectClient, results)
    verifyFn(decrypted)
  }

  return results
}
