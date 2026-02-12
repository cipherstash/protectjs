import 'dotenv/config'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Encryption, type EncryptionClient } from '@cipherstash/stack'
import * as drizzleOrm from 'drizzle-orm'
import { integer, pgTable } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createEncryptionOperators,
  encryptedType,
  extractEncryptionSchema,
} from '../src/pg'
import { docSeedData } from './fixtures/doc-seed-data'
import { type ExecutionContext, executeCodeBlock } from './utils/code-executor'
import { extractExecutableBlocks } from './utils/markdown-parser'

if (!process.env.DATABASE_URL) {
  throw new Error('Missing env.DATABASE_URL')
}

/**
 * Load documentation file and extract executable blocks.
 * Throws if the file is missing or has no executable blocks.
 */
function loadDocumentation(docsPath: string, docName: string) {
  if (!existsSync(docsPath)) {
    throw new Error(`Documentation file not found: ${docsPath}`)
  }

  const markdown = readFileSync(docsPath, 'utf-8')
  const blocks = extractExecutableBlocks(markdown)

  if (blocks.length === 0) {
    throw new Error(
      `No executable blocks found in: ${docsPath}\nExpected \`\`\`ts:run code blocks in documentation.`,
    )
  }

  return blocks
}

// Table schema matching documentation examples
const transactions = pgTable('drizzle-docs-test', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  account: encryptedType<string>('account_number', {
    equality: true,
  }),
  amount: encryptedType<number>('amount', {
    dataType: 'number',
    equality: true,
    orderAndRange: true,
  }),
  description: encryptedType<string>('description', {
    freeTextSearch: true,
    equality: true,
  }),
  createdAt: encryptedType<number>('created_at', {
    dataType: 'number',
    orderAndRange: true,
  }),
})

const encryptionTransactions = extractEncryptionSchema(transactions)

describe('Documentation Drift Tests', () => {
  let db: ReturnType<typeof drizzle>
  let client: ReturnType<typeof postgres>
  let encryptionClient: EncryptionClient
  let encryptionOps: ReturnType<typeof createEncryptionOperators>
  let seedDataIds: number[] = []

  beforeAll(async () => {
    client = postgres(process.env.DATABASE_URL as string)
    db = drizzle({ client })
    encryptionClient = await Encryption({ schemas: [encryptionTransactions] })
    encryptionOps = createEncryptionOperators(encryptionClient)

    // Create test table with EQL encrypted columns (drop if exists for clean state)
    await client`DROP TABLE IF EXISTS "drizzle-docs-test"`
    await client`
      CREATE TABLE "drizzle-docs-test" (
        id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        account_number eql_v2_encrypted,
        amount eql_v2_encrypted,
        description eql_v2_encrypted,
        created_at eql_v2_encrypted
      )
    `

    // Seed test data
    const encrypted = await encryptionClient.bulkEncryptModels(
      docSeedData,
      encryptionTransactions,
    )
    if (encrypted.failure) {
      throw new Error(`Encryption failed: ${encrypted.failure.message}`)
    }

    const inserted = await db
      .insert(transactions)
      .values(encrypted.data)
      .returning({ id: transactions.id })
    seedDataIds = inserted.map((r) => r.id)
  }, 120000)

  afterAll(async () => {
    try {
      // Drop the test table for clean teardown
      await client`DROP TABLE IF EXISTS "drizzle-docs-test"`
    } catch (cleanupError) {
      console.error(
        '[CLEANUP ERROR] Failed to clean up test data:',
        cleanupError,
      )
      // Don't throw - allow test results to be reported even if cleanup fails
    } finally {
      await client.end()
    }
  }, 30000)

  describe('drizzle.md - Encryption Operators Pattern', () => {
    // Path to documentation relative to repo root
    const docsPath = join(
      __dirname,
      '../../../docs/reference/drizzle/drizzle.md',
    )

    const blocks = loadDocumentation(docsPath, 'drizzle.md')

    it.each(blocks.map((b) => [b.section, b]))(
      '%s',
      async (_section, block) => {
        const context: ExecutionContext = {
          db,
          transactions,
          encryption: encryptionOps,
          encryptionClient,
          encryptionTransactions,
          ...drizzleOrm,
        }

        const result = await executeCodeBlock(block.code, context)

        if (!result.success) {
          console.error(`\nFailed block at line ${block.lineNumber}:`)
          console.error('---')
          console.error(block.code)
          console.error('---')
          console.error(`Error: ${result.error}`)
        }

        expect(result.success, `Block failed: ${result.error}`).toBe(true)
        expect(result.result).toBeDefined()
      },
      30000,
    )
  })

  describe('drizzle-encryption.md - Manual Encryption Pattern', () => {
    const docsPath = join(
      __dirname,
      '../../../docs/reference/drizzle/drizzle-encryption.md',
    )

    const blocks = loadDocumentation(docsPath, 'drizzle-encryption.md')

    it.each(blocks.map((b) => [b.section, b]))(
      '%s',
      async (_section, block) => {
        const context: ExecutionContext = {
          db,
          transactions,
          encryptionClient,
          encryptionTransactions,
          ...drizzleOrm,
          // Note: 'encryption' intentionally omitted
        }

        const result = await executeCodeBlock(block.code, context)

        if (!result.success) {
          console.error(`\nFailed block at line ${block.lineNumber}:`)
          console.error('---')
          console.error(block.code)
          console.error('---')
          console.error(`Error: ${result.error}`)
        }

        expect(result.success, `Block failed: ${result.error}`).toBe(true)
        expect(result.result).toBeDefined()
      },
      30000,
    )
  })
})
