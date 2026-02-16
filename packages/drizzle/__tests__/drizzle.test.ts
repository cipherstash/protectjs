import 'dotenv/config'
import { protect } from '@cipherstash/protect'
import type { SQL } from 'drizzle-orm'
import { and, eq } from 'drizzle-orm'
import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createProtectOperators,
  encryptedType,
  extractProtectSchema,
} from '../src/pg'
import { userSeedData } from './fixtures/user-seed-data'
import {
  type EncryptedUserRow,
  type PlaintextUser,
  decryptUserRow,
  decryptUserRows,
  expectRowsToBeEncrypted,
  expectUserToMatchPlaintext,
  expectUsersToMatchPlaintext,
  unwrapResult,
} from './integration-test-helpers'

if (!process.env.DATABASE_URL) {
  throw new Error('Missing env.DATABASE_URL')
}

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

const users = extractProtectSchema(drizzleUsersTable)

// CI database does not currently support ORDER BY on encrypted columns.
const SKIP_ORDER_BY_TEST = true
const FALLBACK_EMAIL = 'john.doe@example.com'
const TEST_RUN_ID = `drizzle-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const encryptedUserSelection = {
  id: drizzleUsersTable.id,
  email: drizzleUsersTable.email,
  age: drizzleUsersTable.age,
  score: drizzleUsersTable.score,
  profile: drizzleUsersTable.profile,
}

let protectClient: Awaited<ReturnType<typeof protect>>
let protectOps: ReturnType<typeof createProtectOperators>
let db: ReturnType<typeof drizzle> | undefined
let postgresClient: ReturnType<typeof postgres> | undefined
let fallbackUserId = -1

function getDb(): ReturnType<typeof drizzle> {
  if (!db) {
    throw new Error('Database client is not initialized')
  }
  return db
}

function getSeedUser(email: string): PlaintextUser {
  const user = userSeedData.find((candidate) => candidate.email === email)
  if (!user) {
    throw new Error(`Expected seed user not found for email: ${email}`)
  }
  return user
}

function filterSeedUsers(predicate: (user: PlaintextUser) => boolean) {
  return userSeedData.filter(predicate)
}

async function selectEncryptedUsers(
  condition: SQL<unknown> | undefined,
): Promise<EncryptedUserRow[]> {
  if (!condition) {
    throw new Error('Expected query condition')
  }

  const rows = await getDb()
    .select(encryptedUserSelection)
    .from(drizzleUsersTable)
    .where(condition)

  return rows as unknown as EncryptedUserRow[]
}

beforeAll(async () => {
  protectClient = await protect({ schemas: [users] })
  protectOps = createProtectOperators(protectClient)

  postgresClient = postgres(process.env.DATABASE_URL as string)
  db = drizzle({ client: postgresClient })

  const encryptedUsers = unwrapResult(
    await protectClient.bulkEncryptModels(userSeedData, users),
    'bulkEncryptModels',
  )

  const rowsToInsert = encryptedUsers.map((user) => ({
    ...user,
    testRunId: TEST_RUN_ID,
  }))

  const insertedRows = await getDb()
    .insert(drizzleUsersTable)
    .values(rowsToInsert)
    .returning({ id: drizzleUsersTable.id })

  expect(insertedRows).toHaveLength(userSeedData.length)

  const fallbackRows = await selectEncryptedUsers(
    and(
      eq(drizzleUsersTable.testRunId, TEST_RUN_ID),
      await protectOps.eq(drizzleUsersTable.email, FALLBACK_EMAIL),
    ),
  )

  expect(fallbackRows).toHaveLength(1)
  fallbackUserId = fallbackRows[0].id
}, 60000)

afterAll(async () => {
  try {
    if (db) {
      await db
        .delete(drizzleUsersTable)
        .where(eq(drizzleUsersTable.testRunId, TEST_RUN_ID))
    }
  } finally {
    await postgresClient?.end()
  }
}, 30000)

describe('Drizzle ORM Integration with Protect.js', () => {
  it('encrypts values for equality queries and decrypts back to exact plaintext', async () => {
    const searchEmail = 'jane.smith@example.com'
    const expectedUser = getSeedUser(searchEmail)

    const rows = await selectEncryptedUsers(
      and(
        eq(drizzleUsersTable.testRunId, TEST_RUN_ID),
        await protectOps.eq(drizzleUsersTable.email, searchEmail),
      ),
    )

    expect(rows).toHaveLength(1)
    expectRowsToBeEncrypted(rows)

    const decryptedUser = await decryptUserRow(protectClient, rows[0])
    expectUserToMatchPlaintext(decryptedUser, expectedUser)
  }, 30000)

  it('executes free-text query patterns and matches exact plaintext rows', async () => {
    const searchText = 'smith'
    const expectedUsers = filterSeedUsers((user) =>
      user.email.toLowerCase().includes(searchText),
    )

    const rows = await selectEncryptedUsers(
      and(
        eq(drizzleUsersTable.testRunId, TEST_RUN_ID),
        await protectOps.ilike(drizzleUsersTable.email, searchText),
      ),
    )

    expect(rows).toHaveLength(expectedUsers.length)
    expectRowsToBeEncrypted(rows)

    const decryptedUsers = await decryptUserRows(protectClient, rows)
    expectUsersToMatchPlaintext(decryptedUsers, expectedUsers)
  }, 30000)

  it('executes range query patterns and decrypts exact plaintext matches', async () => {
    const minAge = 28
    const expectedUsers = filterSeedUsers((user) => user.age >= minAge)

    const rows = await selectEncryptedUsers(
      and(
        eq(drizzleUsersTable.testRunId, TEST_RUN_ID),
        await protectOps.gte(drizzleUsersTable.age, minAge),
      ),
    )

    expect(rows).toHaveLength(expectedUsers.length)
    expectRowsToBeEncrypted(rows)

    const decryptedUsers = await decryptUserRows(protectClient, rows)
    expectUsersToMatchPlaintext(decryptedUsers, expectedUsers)
  }, 30000)

  const orderByIt = SKIP_ORDER_BY_TEST ? it.skip : it
  orderByIt(
    'supports encrypted ordering and preserves decrypted order',
    async () => {
      const expectedInAgeOrder = [...userSeedData].sort(
        (left, right) => left.age - right.age,
      )

      const rows = (await getDb()
        .select(encryptedUserSelection)
        .from(drizzleUsersTable)
        .where(eq(drizzleUsersTable.testRunId, TEST_RUN_ID))
        .orderBy(
          protectOps.asc(drizzleUsersTable.age),
        )) as unknown as EncryptedUserRow[]

      expect(rows).toHaveLength(userSeedData.length)
      expectRowsToBeEncrypted(rows)

      const decryptedUsers = await decryptUserRows(protectClient, rows)

      expect(decryptedUsers.map((user) => user.age)).toEqual(
        expectedInAgeOrder.map((user) => user.age),
      )
      expectUsersToMatchPlaintext(decryptedUsers, expectedInAgeOrder)
    },
    30000,
  )

  it('batches encrypted predicates with and() and returns exact plaintext rows', async () => {
    const minAge = 22
    const maxAge = 35
    const searchText = 'smith'
    const expectedUsers = filterSeedUsers(
      (user) =>
        user.age >= minAge &&
        user.age <= maxAge &&
        user.email.toLowerCase().includes(searchText),
    )

    const rows = await selectEncryptedUsers(
      await protectOps.and(
        eq(drizzleUsersTable.testRunId, TEST_RUN_ID),
        protectOps.gte(drizzleUsersTable.age, minAge),
        protectOps.lte(drizzleUsersTable.age, maxAge),
        protectOps.ilike(drizzleUsersTable.email, searchText),
      ),
    )

    expect(rows).toHaveLength(expectedUsers.length)
    expectRowsToBeEncrypted(rows)

    const decryptedUsers = await decryptUserRows(protectClient, rows)
    expectUsersToMatchPlaintext(decryptedUsers, expectedUsers)
  }, 30000)

  it('mixes encrypted and plain predicates with or() and decrypts to exact plaintext', async () => {
    const targetEmails = ['jane.smith@example.com', 'bob.wilson@example.com']
    const expectedUsers = filterSeedUsers(
      (user) =>
        targetEmails.includes(user.email) || user.email === FALLBACK_EMAIL,
    )

    expect(fallbackUserId).toBeGreaterThan(0)

    const rows = await selectEncryptedUsers(
      await protectOps.and(
        eq(drizzleUsersTable.testRunId, TEST_RUN_ID),
        protectOps.or(
          protectOps.eq(drizzleUsersTable.email, targetEmails[0]),
          protectOps.eq(drizzleUsersTable.email, targetEmails[1]),
          eq(drizzleUsersTable.id, fallbackUserId),
        ),
      ),
    )

    expect(rows).toHaveLength(expectedUsers.length)
    expectRowsToBeEncrypted(rows)

    const decryptedUsers = await decryptUserRows(protectClient, rows)
    expectUsersToMatchPlaintext(decryptedUsers, expectedUsers)
  }, 30000)

  it('decrypts nested JSON payloads back to the original plaintext object', async () => {
    const searchEmail = 'alice.johnson@example.com'
    const expectedUser = getSeedUser(searchEmail)

    const rows = await selectEncryptedUsers(
      and(
        eq(drizzleUsersTable.testRunId, TEST_RUN_ID),
        await protectOps.eq(drizzleUsersTable.email, searchEmail),
      ),
    )

    expect(rows).toHaveLength(1)
    expectRowsToBeEncrypted(rows)

    const decryptedUser = await decryptUserRow(protectClient, rows[0])
    expect(decryptedUser.profile).toEqual(expectedUser.profile)
    expectUserToMatchPlaintext(decryptedUser, expectedUser)
  }, 30000)

  it('supports encrypted inArray query patterns with exact plaintext matching', async () => {
    const searchEmails = ['jane.smith@example.com', 'bob.wilson@example.com']
    const expectedUsers = filterSeedUsers((user) =>
      searchEmails.includes(user.email),
    )

    const rows = await selectEncryptedUsers(
      and(
        eq(drizzleUsersTable.testRunId, TEST_RUN_ID),
        await protectOps.inArray(drizzleUsersTable.email, searchEmails),
      ),
    )

    expect(rows).toHaveLength(expectedUsers.length)
    expectRowsToBeEncrypted(rows)

    const decryptedUsers = await decryptUserRows(protectClient, rows)
    expectUsersToMatchPlaintext(decryptedUsers, expectedUsers)
  }, 30000)

  it('supports encrypted between query patterns with exact plaintext matching', async () => {
    const minAge = 25
    const maxAge = 30
    const expectedUsers = filterSeedUsers(
      (user) => user.age >= minAge && user.age <= maxAge,
    )

    const rows = await selectEncryptedUsers(
      and(
        eq(drizzleUsersTable.testRunId, TEST_RUN_ID),
        await protectOps.between(drizzleUsersTable.age, minAge, maxAge),
      ),
    )

    expect(rows).toHaveLength(expectedUsers.length)
    expectRowsToBeEncrypted(rows)

    const decryptedUsers = await decryptUserRows(protectClient, rows)
    expectUsersToMatchPlaintext(decryptedUsers, expectedUsers)
  }, 30000)
})
