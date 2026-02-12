import 'dotenv/config'
import { Encryption, type EncryptionClient } from '@cipherstash/stack'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createEncryptionOperators,
  encryptedType,
  extractEncryptionSchema,
} from '../src/pg'

if (!process.env.DATABASE_URL) {
  throw new Error('Missing env.DATABASE_URL')
}

// Test data type
interface TestUser {
  id: number
  email: string
  age: number
  score: number
  profile: {
    name: string
    bio: string
    level: number
  }
}

// Drizzle table definition with encrypted columns using object configuration
const drizzleUsersTable = pgTable('protect-ci', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  email: encryptedType<string>('email', {
    freeTextSearch: true,
    equality: true,
    orderAndRange: true,
  }),
  age: encryptedType<number>('age', {
    dataType: 'number',
    equality: true,
    orderAndRange: true,
  }),
  score: encryptedType<number>('score', {
    dataType: 'number',
    equality: true,
    orderAndRange: true,
  }),
  profile: encryptedType<{ name: string; bio: string; level: number }>(
    'profile',
    {
      dataType: 'json',
    },
  ),
  createdAt: timestamp('created_at').defaultNow(),
  testRunId: text('test_run_id'),
})

// Extract Encryption schema from Drizzle table
const users = extractEncryptionSchema(drizzleUsersTable)

// Hard code this as the CI database doesn't support order by on encrypted columns
const SKIP_ORDER_BY_TEST = true

// Unique identifier for this test run to isolate data from concurrent test runs
const TEST_RUN_ID = `drizzle-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

// Test data interface for decrypted results
interface DecryptedUser {
  id: number
  email: string
  age: number
  score: number
  profile: {
    name: string
    bio: string
    level: number
  }
}

let encryptionClient: EncryptionClient
let encryptionOps: ReturnType<typeof createEncryptionOperators>
let db: ReturnType<typeof drizzle>
const testData: TestUser[] = []

beforeAll(async () => {
  // Initialize Encryption client using schema extracted from Drizzle table
  encryptionClient = await Encryption({ schemas: [users] })
  encryptionOps = createEncryptionOperators(encryptionClient)

  const client = postgres(process.env.DATABASE_URL as string)
  db = drizzle({ client })

  // Create test data
  const testUsers: Omit<TestUser, 'id'>[] = [
    {
      email: 'john.doe@example.com',
      age: 25,
      score: 85,
      profile: {
        name: 'John Doe',
        bio: 'Software engineer with 5 years experience',
        level: 3,
      },
    },
    {
      email: 'jane.smith@example.com',
      age: 30,
      score: 92,
      profile: {
        name: 'Jane Smith',
        bio: 'Senior developer specializing in React',
        level: 4,
      },
    },
    {
      email: 'bob.wilson@example.com',
      age: 35,
      score: 78,
      profile: {
        name: 'Bob Wilson',
        bio: 'Full-stack developer and team lead',
        level: 5,
      },
    },
    {
      email: 'alice.johnson@example.com',
      age: 28,
      score: 88,
      profile: {
        name: 'Alice Johnson',
        bio: 'Frontend specialist with design skills',
        level: 3,
      },
    },
    {
      email: 'jill.smith@example.com',
      age: 22,
      score: 75,
      profile: {
        name: 'Jill Smith',
        bio: 'Backend developer with 3 years experience',
        level: 3,
      },
    },
  ]

  // Encrypt and insert test data using Drizzle
  const encryptedUser = await encryptionClient.bulkEncryptModels(
    testUsers,
    users,
  )

  if (encryptedUser.failure) {
    throw new Error(`Encryption failed: ${encryptedUser.failure.message}`)
  }

  // Add test_run_id to each record for test isolation
  const dataWithTestRunId = encryptedUser.data.map((user) => ({
    ...user,
    testRunId: TEST_RUN_ID,
  }))

  const insertedUsers = await db
    .insert(drizzleUsersTable)
    .values(dataWithTestRunId)
    .returning({
      id: drizzleUsersTable.id,
      email: drizzleUsersTable.email,
      age: drizzleUsersTable.age,
      score: drizzleUsersTable.score,
      profile: drizzleUsersTable.profile,
    })

  // @ts-ignore - TODO figure out how to have type safety for returned values from Drizzle
  testData.push(...insertedUsers)
}, 60000)

afterAll(async () => {
  // Clean up test data using test_run_id for reliable isolation
  await db
    .delete(drizzleUsersTable)
    .where(eq(drizzleUsersTable.testRunId, TEST_RUN_ID))
}, 30000)

describe('Drizzle ORM Integration with Encryption', () => {
  it('should perform equality search using encryption operators', async () => {
    const searchEmail = 'jane.smith@example.com'

    // Query using encryption operators - encryption is handled automatically
    const results = await db
      .select({
        id: drizzleUsersTable.id,
        email: drizzleUsersTable.email,
        age: drizzleUsersTable.age,
        score: drizzleUsersTable.score,
        profile: drizzleUsersTable.profile,
      })
      .from(drizzleUsersTable)
      .where(
        and(
          eq(drizzleUsersTable.testRunId, TEST_RUN_ID),
          await encryptionOps.eq(drizzleUsersTable.email, searchEmail),
        ),
      )

    expect(results).toHaveLength(1)

    // Decrypt and verify
    const decrypted = await encryptionClient.decryptModel(results[0])
    if (decrypted.failure) {
      throw new Error(`Decryption failed: ${decrypted.failure.message}`)
    }

    const decryptedUser = decrypted.data as DecryptedUser
    expect(decryptedUser.email).toBe(searchEmail)
  }, 30000)

  it('should perform text search using encryption operators', async () => {
    const searchText = 'smith'

    // Query using encryption operators - encryption is handled automatically
    const results = await db
      .select({
        id: drizzleUsersTable.id,
        email: drizzleUsersTable.email,
        age: drizzleUsersTable.age,
        score: drizzleUsersTable.score,
        profile: drizzleUsersTable.profile,
      })
      .from(drizzleUsersTable)
      .where(
        and(
          eq(drizzleUsersTable.testRunId, TEST_RUN_ID),
          await encryptionOps.ilike(drizzleUsersTable.email, searchText),
        ),
      )

    // Should find users with 'smith' in their email
    expect(results.length).toBeGreaterThan(0)

    // Decrypt and verify
    const decryptedResults = await encryptionClient.bulkDecryptModels(results)
    if (decryptedResults.failure) {
      throw new Error(
        `Bulk decryption failed: ${decryptedResults.failure.message}`,
      )
    }

    // Verify at least one result contains the search text
    const foundMatch = decryptedResults.data.some((user) => {
      const decryptedUser = user as DecryptedUser
      return (
        decryptedUser.email?.toLowerCase().includes(searchText.toLowerCase()) ||
        decryptedUser.profile?.bio
          ?.toLowerCase()
          .includes(searchText.toLowerCase())
      )
    })
    expect(foundMatch).toBe(true)
  }, 30000)

  it('should perform number range queries using encryption operators', async () => {
    const minAge = 28

    // Query using encryption operators - encryption is handled automatically
    const results = await db
      .select({
        id: drizzleUsersTable.id,
        email: drizzleUsersTable.email,
        age: drizzleUsersTable.age,
        score: drizzleUsersTable.score,
        profile: drizzleUsersTable.profile,
      })
      .from(drizzleUsersTable)
      .where(
        and(
          eq(drizzleUsersTable.testRunId, TEST_RUN_ID),
          await encryptionOps.gte(drizzleUsersTable.age, minAge),
        ),
      )

    // Should find users with age >= 28
    expect(results.length).toBeGreaterThan(0)

    // Decrypt and verify
    const decryptedResults = await encryptionClient.bulkDecryptModels(results)
    if (decryptedResults.failure) {
      throw new Error(
        `Bulk decryption failed: ${decryptedResults.failure.message}`,
      )
    }

    // Verify all results have age >= 28
    const allValidAges = decryptedResults.data.every((user) => {
      const decryptedUser = user as DecryptedUser
      return (
        decryptedUser.age !== null &&
        decryptedUser.age !== undefined &&
        decryptedUser.age >= minAge
      )
    })
    expect(allValidAges).toBe(true)
  }, 30000)

  it('should perform sorting using Drizzle operators', async () => {
    if (SKIP_ORDER_BY_TEST) {
      console.log('Skipping order by test - not supported by this database')
      return
    }

    const a = db
      .select({
        id: drizzleUsersTable.id,
        email: drizzleUsersTable.email,
        age: drizzleUsersTable.age,
        score: drizzleUsersTable.score,
        profile: drizzleUsersTable.profile,
      })
      .from(drizzleUsersTable)
      .where(eq(drizzleUsersTable.testRunId, TEST_RUN_ID))
      .orderBy(encryptionOps.asc(drizzleUsersTable.age))

    const results = await a

    expect(results.length).toBeGreaterThan(0)

    // Decrypt and verify sorting
    const decryptedResults = await encryptionClient.bulkDecryptModels(results)
    if (decryptedResults.failure) {
      throw new Error(
        `Bulk decryption failed: ${decryptedResults.failure.message}`,
      )
    }

    // Verify ages are sorted in ascending order
    const ages = decryptedResults.data
      .map((user) => (user as DecryptedUser).age)
      .filter((age): age is number => age !== null && age !== undefined)
      .sort((a, b) => a - b)

    const sortedAges = decryptedResults.data
      .map((user) => (user as DecryptedUser).age)
      .filter((age): age is number => age !== null && age !== undefined)

    expect(sortedAges).toEqual(ages)
  }, 30000)

  it('should perform complex queries with multiple conditions using batched and()', async () => {
    const minAge = 25
    const maxAge = 35
    const searchText = 'developer'

    // Complex query using encryption operators with batched and() - encryption is handled automatically
    // All operator calls are batched into a single createSearchTerms call
    const results = await db
      .select({
        id: drizzleUsersTable.id,
        email: drizzleUsersTable.email,
        age: drizzleUsersTable.age,
        score: drizzleUsersTable.score,
        profile: drizzleUsersTable.profile,
      })
      .from(drizzleUsersTable)
      .where(
        await encryptionOps.and(
          eq(drizzleUsersTable.testRunId, TEST_RUN_ID),
          encryptionOps.gte(drizzleUsersTable.age, minAge),
          encryptionOps.lte(drizzleUsersTable.age, maxAge),
          encryptionOps.ilike(drizzleUsersTable.email, searchText),
        ),
      )

    // Decrypt and verify
    const decryptedResults = await encryptionClient.bulkDecryptModels(results)
    if (decryptedResults.failure) {
      throw new Error(
        `Bulk decryption failed: ${decryptedResults.failure.message}`,
      )
    }

    // Verify all results meet the criteria
    // Note: We're filtering by id = 1 (regular Drizzle operator) plus encrypted columns
    const allValidResults = decryptedResults.data.every((user) => {
      const decryptedUser = user as DecryptedUser
      // Encrypted operators: age range
      const ageValid =
        decryptedUser.age !== null &&
        decryptedUser.age !== undefined &&
        decryptedUser.age >= minAge &&
        decryptedUser.age <= maxAge
      // Encrypted operator: text search
      const textValid =
        decryptedUser.email?.toLowerCase().includes(searchText.toLowerCase()) ||
        decryptedUser.profile?.bio
          ?.toLowerCase()
          .includes(searchText.toLowerCase())
      return ageValid && textValid
    })

    expect(allValidResults).toBe(true)
  }, 30000)

  it('should perform queries with multiple conditions using batched or()', async () => {
    const targetEmails = ['jane.smith@example.com', 'bob.wilson@example.com']
    const fallbackId = testData[0]?.id ?? -1

    const results = await db
      .select({
        id: drizzleUsersTable.id,
        email: drizzleUsersTable.email,
        age: drizzleUsersTable.age,
        score: drizzleUsersTable.score,
        profile: drizzleUsersTable.profile,
      })
      .from(drizzleUsersTable)
      .where(
        await encryptionOps.and(
          eq(drizzleUsersTable.testRunId, TEST_RUN_ID),
          encryptionOps.or(
            encryptionOps.eq(drizzleUsersTable.email, targetEmails[0]),
            encryptionOps.eq(drizzleUsersTable.email, targetEmails[1]),
            eq(drizzleUsersTable.id, fallbackId),
          ),
        ),
      )

    expect(results.length).toBe(targetEmails.length + 1) // +1 for fallbackId row

    const decryptedResults = await encryptionClient.bulkDecryptModels(results)
    if (decryptedResults.failure) {
      throw new Error(
        `Bulk decryption failed: ${decryptedResults.failure.message}`,
      )
    }

    const emails = decryptedResults.data.map(
      (user) => (user as DecryptedUser).email,
    )

    for (const email of targetEmails) {
      expect(emails).toContain(email)
    }
  }, 30000)

  it('should handle nested field encryption and decryption', async () => {
    // Get a user with nested data
    const results = await db
      .select({
        id: drizzleUsersTable.id,
        email: drizzleUsersTable.email,
        age: drizzleUsersTable.age,
        score: drizzleUsersTable.score,
        profile: drizzleUsersTable.profile,
      })
      .from(drizzleUsersTable)
      .where(eq(drizzleUsersTable.testRunId, TEST_RUN_ID))
      .limit(1)

    if (!results[0]) {
      throw new Error('No users found')
    }

    // Decrypt and verify nested fields
    const decrypted = await encryptionClient.decryptModel(results[0])
    if (decrypted.failure) {
      throw new Error(`Decryption failed: ${decrypted.failure.message}`)
    }

    const decryptedUser = decrypted.data as DecryptedUser

    // Verify nested profile structure
    expect(decryptedUser.profile).toBeDefined()
    expect(decryptedUser.profile.name).toBeDefined()
    expect(decryptedUser.profile.bio).toBeDefined()
    expect(decryptedUser.profile.level).toBeDefined()
    expect(typeof decryptedUser.profile.level).toBe('number')
  }, 30000)

  it('should handle inArray operator with encrypted columns', async () => {
    const searchEmails = ['jane.smith@example.com', 'bob.wilson@example.com']

    // Query using encryption operators with inArray
    const results = await db
      .select({
        id: drizzleUsersTable.id,
        email: drizzleUsersTable.email,
        age: drizzleUsersTable.age,
        score: drizzleUsersTable.score,
        profile: drizzleUsersTable.profile,
      })
      .from(drizzleUsersTable)
      .where(
        and(
          eq(drizzleUsersTable.testRunId, TEST_RUN_ID),
          await encryptionOps.inArray(drizzleUsersTable.email, searchEmails),
        ),
      )

    // Should find 2 users
    expect(results.length).toBe(2)

    // Decrypt and verify
    const decryptedResults = await encryptionClient.bulkDecryptModels(results)
    if (decryptedResults.failure) {
      throw new Error(
        `Bulk decryption failed: ${decryptedResults.failure.message}`,
      )
    }

    // Verify all results have the expected emails
    const emails = decryptedResults.data.map(
      (user) => (user as DecryptedUser).email,
    )
    expect(emails).toContain('jane.smith@example.com')
    expect(emails).toContain('bob.wilson@example.com')
  }, 30000)

  it('should handle between operator with encrypted columns', async () => {
    const minAge = 25
    const maxAge = 30

    // Query using encryption operators with between
    const results = await db
      .select({
        id: drizzleUsersTable.id,
        email: drizzleUsersTable.email,
        age: drizzleUsersTable.age,
        score: drizzleUsersTable.score,
        profile: drizzleUsersTable.profile,
      })
      .from(drizzleUsersTable)
      .where(
        and(
          eq(drizzleUsersTable.testRunId, TEST_RUN_ID),
          await encryptionOps.between(drizzleUsersTable.age, minAge, maxAge),
        ),
      )

    // Should find users with age between 25 and 30
    expect(results.length).toBeGreaterThan(0)

    // Decrypt and verify
    const decryptedResults = await encryptionClient.bulkDecryptModels(results)
    if (decryptedResults.failure) {
      throw new Error(
        `Bulk decryption failed: ${decryptedResults.failure.message}`,
      )
    }

    // Verify all results have age between min and max
    const allValidAges = decryptedResults.data.every((user) => {
      const decryptedUser = user as DecryptedUser
      return (
        decryptedUser.age !== null &&
        decryptedUser.age !== undefined &&
        decryptedUser.age >= minAge &&
        decryptedUser.age <= maxAge
      )
    })
    expect(allValidAges).toBe(true)
  }, 30000)
})
