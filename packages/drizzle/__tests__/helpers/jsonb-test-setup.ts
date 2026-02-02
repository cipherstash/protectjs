/**
 * JSONB Test Setup Factory
 *
 * Provides a shared setup/teardown factory for JSONB tests.
 * Eliminates duplicated boilerplate across test files.
 */
import 'dotenv/config'
import { protect } from '@cipherstash/protect'
import { eq, sql } from 'drizzle-orm'
import type { PgTableWithColumns } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { beforeAll, afterAll } from 'vitest'
import { createTestRunId } from '../fixtures/jsonb-test-data'

if (!process.env.DATABASE_URL) {
  throw new Error('Missing env.DATABASE_URL')
}

type ProtectClient = Awaited<ReturnType<typeof protect>>
type DrizzleDB = ReturnType<typeof drizzle>

/**
 * Configuration for the JSONB test suite
 */
export interface JsonbTestConfig<TData = unknown> {
  /** Name used for the test run ID prefix */
  tableName: string
  /** The Drizzle table definition */
  tableDefinition: PgTableWithColumns<any>
  /** The primary Protect.js schema extracted from the Drizzle table */
  schema: any
  /** Optional additional schemas (e.g., searchable schemas) */
  additionalSchemas?: any[]
  /** Test data to encrypt and insert - single object or array */
  testData: TData | TData[]
  /** SQL for creating the table */
  createTableSql: string
}

/**
 * Result returned by createJsonbTestSuite
 */
export interface JsonbTestSuiteContext {
  /** Unique test run ID for this suite */
  TEST_RUN_ID: string
  /** Get the initialized Protect client */
  getProtectClient: () => ProtectClient
  /** Get the Drizzle database instance */
  getDb: () => DrizzleDB
  /** Get the IDs of inserted test records */
  getInsertedIds: () => number[]
  /** Get the first inserted ID (convenience for single-record tests) */
  getInsertedId: () => number
}

/**
 * Creates a JSONB test suite with shared setup and teardown.
 *
 * Usage:
 * ```typescript
 * const { TEST_RUN_ID, getProtectClient, getDb, getInsertedId } = createJsonbTestSuite({
 *   tableName: 'jsonb_array_ops',
 *   tableDefinition: jsonbArrayOpsTable,
 *   schema: arrayOpsSchema,
 *   additionalSchemas: [searchableSchema],
 *   testData: standardJsonbData,
 *   createTableSql: `
 *     CREATE TABLE table_name (
 *       id SERIAL PRIMARY KEY,
 *       encrypted_jsonb eql_v2_encrypted,
 *       created_at TIMESTAMP DEFAULT NOW(),
 *       test_run_id TEXT
 *     )
 *   `,
 * })
 *
 * describe('My Tests', () => {
 *   it('should work', async () => {
 *     const db = getDb()
 *     const protectClient = getProtectClient()
 *     // ...
 *   })
 * })
 * ```
 */
export function createJsonbTestSuite<TData = unknown>(
  config: JsonbTestConfig<TData>,
): JsonbTestSuiteContext {
  const TEST_RUN_ID = createTestRunId(config.tableName)

  let protectClient: ProtectClient
  let db: DrizzleDB
  const insertedIds: number[] = []

  beforeAll(async () => {
    // Initialize Protect.js client with all schemas
    const schemas = [config.schema, ...(config.additionalSchemas || [])]
    protectClient = await protect({ schemas })

    // Initialize database connection
    const client = postgres(process.env.DATABASE_URL as string)
    db = drizzle({ client })

    // Get table name from the table definition
    const tableName = (config.tableDefinition as any)[Symbol.for('drizzle:Name')]

    // Drop and recreate test table
    await db.execute(sql.raw(`DROP TABLE IF EXISTS ${tableName}`))
    await db.execute(sql.raw(config.createTableSql))

    // Encrypt and insert test data
    const testDataArray = Array.isArray(config.testData)
      ? config.testData
      : [config.testData]

    for (const data of testDataArray) {
      const encrypted = await protectClient.encryptModel(
        { encrypted_jsonb: data },
        config.schema,
      )

      if (encrypted.failure) {
        throw new Error(`Encryption failed: ${encrypted.failure.message}`)
      }

      const inserted = await db
        .insert(config.tableDefinition)
        .values({
          ...encrypted.data,
          testRunId: TEST_RUN_ID,
        })
        .returning({ id: (config.tableDefinition as any).id })

      insertedIds.push(inserted[0].id)
    }
  }, 60000)

  afterAll(async () => {
    // Clean up test data
    await db
      .delete(config.tableDefinition)
      .where(eq((config.tableDefinition as any).testRunId, TEST_RUN_ID))
  }, 30000)

  return {
    TEST_RUN_ID,
    getProtectClient: () => protectClient,
    getDb: () => db,
    getInsertedIds: () => insertedIds,
    getInsertedId: () => insertedIds[0],
  }
}

/**
 * Standard table creation SQL template.
 * Replace TABLE_NAME with your actual table name.
 */
export const STANDARD_TABLE_SQL = (tableName: string) => `
  CREATE TABLE ${tableName} (
    id SERIAL PRIMARY KEY,
    encrypted_jsonb eql_v2_encrypted,
    created_at TIMESTAMP DEFAULT NOW(),
    test_run_id TEXT
  )
`
