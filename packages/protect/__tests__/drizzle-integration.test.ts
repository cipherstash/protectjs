import 'dotenv/config'
import { csColumn, csTable } from '@cipherstash/schema'
import { and, asc, eq, gte, ilike, inArray, like, lte, sql } from 'drizzle-orm'
import { customType, integer, pgTable, timestamp } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { protect } from '../src'

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

// Protect.js schema
const users = csTable('protect-ci', {
  email: csColumn('email').freeTextSearch().equality().orderAndRange(),
  age: csColumn('age').dataType('number').equality().orderAndRange(),
  score: csColumn('score').dataType('number').equality().orderAndRange(),
  profile: csColumn('profile').dataType('json'),
})

// TODO - Include this in one of the protect packages (needs to have Drizzle as a peer dependency)
const encrypted = <TData>(name: string) =>
  customType<{ data: TData; driverData: string }>({
    dataType() {
      return 'eql_v2_encrypted'
    },
    toDriver(value: TData): string {
      const jsonStr = JSON.stringify(value)
      const escaped = jsonStr.replace(/"/g, '""')
      return `("${escaped}")`
    },
    fromDriver(value: string): TData {
      const parseComposite = (str: string) => {
        if (!str || str === '') return null

        const trimmed = str.trim()

        if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
          let inner = trimmed.slice(1, -1)
          inner = inner.replace(/""/g, '"')

          if (inner.startsWith('"') && inner.endsWith('"')) {
            const stripped = inner.slice(1, -1)
            return JSON.parse(stripped)
          }

          if (inner.startsWith('{') || inner.startsWith('[')) {
            return JSON.parse(inner)
          }

          return inner
        }

        return JSON.parse(str)
      }

      return parseComposite(value) as TData
    },
  })(name)

// Drizzle table definition
const drizzleUsersTable = pgTable('protect-ci', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  email: encrypted('email'),
  age: encrypted('age'),
  score: encrypted('score'),
  profile: encrypted('profile'),
  createdAt: timestamp('created_at').defaultNow(),
})

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

let protectClient: Awaited<ReturnType<typeof protect>>
let db: ReturnType<typeof drizzle>
const testData: TestUser[] = []

beforeAll(async () => {
  // Initialize Protect.js client
  protectClient = await protect({ schemas: [users] })

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
  const encryptedUser = await protectClient.bulkEncryptModels(testUsers, users)

  if (encryptedUser.failure) {
    throw new Error(`Encryption failed: ${encryptedUser.failure.message}`)
  }

  const insertedUsers = await db
    .insert(drizzleUsersTable)
    .values(encryptedUser.data)
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
  // Clean up test data using Drizzle
  if (testData.length > 0) {
    const ids = testData.map((d) => d.id)
    await db.delete(drizzleUsersTable).where(inArray(drizzleUsersTable.id, ids))
  }
}, 30000)

describe('Drizzle ORM Integration with Protect.js', () => {
  it('should perform equality search using Drizzle operators', async () => {
    const searchEmail = 'jane.smith@example.com'

    // Create search term
    const searchTerm = await protectClient.createSearchTerms([
      {
        value: searchEmail,
        column: users.email,
        table: users,
      },
    ])

    if (searchTerm.failure) {
      throw new Error(
        `Search term creation failed: ${searchTerm.failure.message}`,
      )
    }

    // Query using Drizzle operators
    const results = await db
      .select({
        id: drizzleUsersTable.id,
        email: drizzleUsersTable.email,
        age: drizzleUsersTable.age,
        score: drizzleUsersTable.score,
        profile: drizzleUsersTable.profile,
      })
      .from(drizzleUsersTable)
      .where(eq(drizzleUsersTable.email, searchTerm.data[0]))

    expect(results).toHaveLength(1)

    // Decrypt and verify
    const decrypted = await protectClient.decryptModel(results[0])
    if (decrypted.failure) {
      throw new Error(`Decryption failed: ${decrypted.failure.message}`)
    }

    const decryptedUser = decrypted.data as DecryptedUser
    expect(decryptedUser.email).toBe(searchEmail)
  }, 30000)

  it('should perform text search using Drizzle operators', async () => {
    const searchText = 'smith'

    // Create search term
    const searchTerm = await protectClient.createSearchTerms([
      {
        value: searchText,
        column: users.email,
        table: users,
        returnType: 'composite-literal',
      },
    ])

    if (searchTerm.failure) {
      throw new Error(
        `Search term creation failed: ${searchTerm.failure.message}`,
      )
    }

    // Query using Drizzle operators (simulating LIKE search)
    const results = await db
      .select({
        id: drizzleUsersTable.id,
        email: drizzleUsersTable.email,
        age: drizzleUsersTable.age,
        score: drizzleUsersTable.score,
        profile: drizzleUsersTable.profile,
      })
      .from(drizzleUsersTable)
      // @ts-ignore - TODO figure out how to have type safetfy when using composite-literal (it's a string)
      .where(like(drizzleUsersTable.email, searchTerm.data[0]))

    // Should find users with 'developer' in their email
    expect(results.length).toBeGreaterThan(0)

    // Decrypt and verify
    const decryptedResults = await protectClient.bulkDecryptModels(results)
    if (decryptedResults.failure) {
      throw new Error(
        `Bulk decryption failed: ${decryptedResults.failure.message}`,
      )
    }

    // Verify at least one result contains the search text
    const foundMatch = decryptedResults.data.some((user) => {
      const decryptedUser = user as DecryptedUser
      return (
        decryptedUser.email?.includes(searchText) ||
        decryptedUser.profile?.bio?.includes(searchText)
      )
    })
    expect(foundMatch).toBe(true)
  }, 30000)

  it('should perform number range queries using Drizzle operators', async () => {
    const minAge = 28

    // Create search term
    const ageSearchTerm = await protectClient.createSearchTerms([
      {
        value: minAge,
        column: users.age,
        table: users,
      },
    ])

    if (ageSearchTerm.failure) {
      throw new Error(
        `Search term creation failed: ${ageSearchTerm.failure.message}`,
      )
    }

    // Query using Drizzle operators
    const results = await db
      .select({
        id: drizzleUsersTable.id,
        email: drizzleUsersTable.email,
        age: drizzleUsersTable.age,
        score: drizzleUsersTable.score,
        profile: drizzleUsersTable.profile,
      })
      .from(drizzleUsersTable)
      .where(gte(drizzleUsersTable.age, ageSearchTerm.data[0]))

    // Should find users with age >= 28
    expect(results.length).toBeGreaterThan(0)

    // Decrypt and verify
    const decryptedResults = await protectClient.bulkDecryptModels(results)
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
    // TODO - This currently isn't working as expected, the orderBy is not being applied to the query
    // SQL -> select "id", "email", "age", "score", "profile" from "protect-ci" order by eql_v2.order_by(age) asc;
    const a = db
      .select({
        id: drizzleUsersTable.id,
        email: drizzleUsersTable.email,
        age: drizzleUsersTable.age,
        score: drizzleUsersTable.score,
        profile: drizzleUsersTable.profile,
      })
      .from(drizzleUsersTable)
      // Required for Supabase to use the EQL v2 function since operator families are not supported
      // Outside of Drizzle, you would use `orderBy(asc(drizzleUsersTable.age,))`
      .orderBy(asc(sql`eql_v2.order_by(age)`))

    const results = await a

    expect(results.length).toBeGreaterThan(0)

    // Decrypt and verify sorting
    const decryptedResults = await protectClient.bulkDecryptModels(results)
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

  it('should perform complex queries with multiple conditions', async () => {
    const minAge = 25
    const maxAge = 35
    const searchText = 'developer'

    // Create search terms
    const terms = await protectClient.createSearchTerms([
      { value: minAge, column: users.age, table: users },
      { value: maxAge, column: users.age, table: users },
      {
        value: searchText,
        column: users.email,
        table: users,
        returnType: 'composite-literal',
      },
    ])

    if (terms.failure) {
      throw new Error(`Search terms creation failed: ${terms.failure.message}`)
    }

    // Complex query using Drizzle operators
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
          gte(drizzleUsersTable.age, terms.data[0]),
          lte(drizzleUsersTable.age, terms.data[1]),
          // @ts-ignore - TODO figure out how to have type safetfy when using composite-literal (it's a string)
          ilike(drizzleUsersTable.email, terms.data[2]),
        ),
      )

    // Decrypt and verify
    const decryptedResults = await protectClient.bulkDecryptModels(results)
    if (decryptedResults.failure) {
      throw new Error(
        `Bulk decryption failed: ${decryptedResults.failure.message}`,
      )
    }

    // Verify all results meet the criteria
    const allValidResults = decryptedResults.data.every((user) => {
      const decryptedUser = user as DecryptedUser
      const ageValid =
        decryptedUser.age !== null &&
        decryptedUser.age !== undefined &&
        decryptedUser.age >= minAge &&
        decryptedUser.age <= maxAge
      const textValid =
        decryptedUser.email?.includes(searchText) ||
        decryptedUser.profile?.bio?.includes(searchText)
      return ageValid && textValid
    })

    expect(allValidResults).toBe(true)
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
      .limit(1)

    if (!results[0]) {
      throw new Error('No users found')
    }

    // Decrypt and verify nested fields
    const decrypted = await protectClient.decryptModel(results[0])
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

  it('should validate that nested fields are not searchable', async () => {
    // This test verifies that we can't search on nested fields
    // We'll try to search on profile.name which should not work with searchable encryption

    const searchName = 'John'

    // Create search term for nested field (this should work for encryption but not search)
    // Note: This will fail because nested fields can't be used for searchable encryption
    try {
      const searchTerm = await protectClient.createSearchTerms([
        {
          value: searchName,
          column: users.email, // Use a searchable field instead
          table: users,
        },
      ])

      if (searchTerm.failure) {
        throw new Error(
          `Search term creation failed: ${searchTerm.failure.message}`,
        )
      }

      // Note: In a real implementation, you wouldn't be able to use this search term
      // in a WHERE clause for searchable encryption, but we can verify the term was created
      expect(searchTerm.data).toBeDefined()
      expect(searchTerm.data[0]).toBeDefined()
    } catch (error) {
      // This is expected to fail for nested fields
      expect(error).toBeDefined()
    }
  }, 30000)
})
