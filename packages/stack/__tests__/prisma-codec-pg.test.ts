/**
 * Integration tests for the Prisma Next codec against a real Postgres
 * instance with the EQL extension installed and a real `EncryptionClient`
 * (ZeroKMS-backed).
 *
 * Required environment:
 *   - `DATABASE_URL` to a Postgres instance with EQL pre-installed
 *     (CipherStash CLI: `cipherstash install`).
 *   - `CS_WORKSPACE_CRN`, `CS_CLIENT_ID`, `CS_CLIENT_KEY` for the
 *     `EncryptionClient` to authenticate against ZeroKMS.
 *
 * Without those env vars the suite is skipped (it does not throw at
 * import time, so the unit-test suite can run the file freely).
 *
 * Run command:
 *   pnpm --filter @cipherstash/stack vitest run __tests__/prisma-codec-pg.test.ts
 */

import 'dotenv/config'
import { Encryption, type EncryptionClient } from '@/encryption'
import type { CipherStashCodecContext } from '@/prisma/core/codec-context'
import { createEncryptedEqTermCodec } from '@/prisma/core/codec-eq-term'
import { createEncryptedMatchTermCodec } from '@/prisma/core/codec-match-term'
import { createEncryptedOreTermCodec } from '@/prisma/core/codec-ore-term'
import { createEncryptedSteVecSelectorCodec } from '@/prisma/core/codec-ste-vec-term'
import { createEncryptedStorageCodec } from '@/prisma/core/codec-storage'
import { createEncryptionBinding } from '@/prisma/core/encryption-client'
import { encryptedColumn, encryptedTable } from '@/schema'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const DATABASE_URL = process.env.DATABASE_URL
const HAS_KMS_CREDS =
  !!process.env.CS_WORKSPACE_CRN &&
  !!process.env.CS_CLIENT_ID &&
  !!process.env.CS_CLIENT_KEY

const isReady = !!DATABASE_URL && HAS_KMS_CREDS
const describeIntegration = isReady ? describe : describe.skip

function buildContext(
  client: EncryptionClient,
  // biome-ignore lint/suspicious/noExplicitAny: integration test bridges schema generic types across the encryption-client / codec boundary
  schemas: ReadonlyArray<any>,
): CipherStashCodecContext {
  const binding = createEncryptionBinding({ client, schemas })
  return {
    binding,
    emit: () => {
      // no-op for integration tests
    },
  }
}

describeIntegration(
  'codec integration (Postgres + ZeroKMS): equality round-trip',
  () => {
    const usersSchema = encryptedTable('protect_prisma_users', {
      email: encryptedColumn('email').equality(),
    })

    const TABLE_NAME = `protect_prisma_users_${Date.now()}`

    let sql: ReturnType<typeof postgres>
    let storageCodec: ReturnType<typeof createEncryptedStorageCodec>
    let eqTermCodec: ReturnType<typeof createEncryptedEqTermCodec>

    beforeAll(async () => {
      if (!DATABASE_URL) return
      sql = postgres(DATABASE_URL, { prepare: false })
      await sql`CREATE TABLE IF NOT EXISTS ${sql(TABLE_NAME)} (
        id serial PRIMARY KEY,
        email eql_v2_encrypted NOT NULL
      )`

      const client = await Encryption({ schemas: [usersSchema] })
      const ctx = buildContext(client, [usersSchema])
      storageCodec = createEncryptedStorageCodec(ctx)
      eqTermCodec = createEncryptedEqTermCodec(ctx)
    })

    afterAll(async () => {
      if (sql) {
        await sql`DROP TABLE IF EXISTS ${sql(TABLE_NAME)}`
        await sql.end()
      }
    })

    it('round-trips a 4-row insert through encode -> SELECT -> decode in one ZeroKMS encrypt batch', async () => {
      const inputs = [
        'alice@example.com',
        'bob@example.com',
        'carol@example.com',
        'dave@example.com',
      ]

      const wires = await Promise.all(inputs.map((v) => storageCodec.encode(v)))

      for (const wire of wires) {
        await sql`INSERT INTO ${sql(TABLE_NAME)} (email) VALUES (${wire}::eql_v2_encrypted)`
      }

      const matchWire = await eqTermCodec.encode('carol@example.com')
      const rows = await sql`
        SELECT email FROM ${sql(TABLE_NAME)}
        WHERE eql_v2.eq(email, ${matchWire}::eql_v2_encrypted)
      `

      expect(rows).toHaveLength(1)
      const wireBack = rows[0]?.email
      expect(typeof wireBack).toBe('string')
      const decoded = await storageCodec.decode(String(wireBack))
      expect(decoded).toBe('carol@example.com')
    })
  },
)

describeIntegration('codec integration: ORE range queries on numbers', () => {
  const numbersSchema = encryptedTable('protect_prisma_numbers', {
    score: encryptedColumn('score').dataType('number').orderAndRange(),
  })
  const TABLE_NAME = `protect_prisma_numbers_${Date.now()}`

  let sql: ReturnType<typeof postgres>
  let storageCodec: ReturnType<typeof createEncryptedStorageCodec>
  let oreTermCodec: ReturnType<typeof createEncryptedOreTermCodec>

  beforeAll(async () => {
    if (!DATABASE_URL) return
    sql = postgres(DATABASE_URL, { prepare: false })
    await sql`CREATE TABLE IF NOT EXISTS ${sql(TABLE_NAME)} (
        id serial PRIMARY KEY,
        score eql_v2_encrypted NOT NULL
      )`
    const client = await Encryption({ schemas: [numbersSchema] })
    const ctx = buildContext(client, [numbersSchema])
    storageCodec = createEncryptedStorageCodec(ctx)
    oreTermCodec = createEncryptedOreTermCodec(ctx)
  })

  afterAll(async () => {
    if (sql) {
      await sql`DROP TABLE IF EXISTS ${sql(TABLE_NAME)}`
      await sql.end()
    }
  })

  it('round-trips gt / gte / lt / lte / between on encrypted numbers', async () => {
    const values = [10, 20, 30, 40, 50]
    const wires = await Promise.all(values.map((v) => storageCodec.encode(v)))
    for (const wire of wires) {
      await sql`INSERT INTO ${sql(TABLE_NAME)} (score) VALUES (${wire}::eql_v2_encrypted)`
    }

    const gteTerm = await oreTermCodec.encode(30)
    const gteRows = await sql`
        SELECT score FROM ${sql(TABLE_NAME)}
        WHERE eql_v2.gte(score, ${gteTerm}::eql_v2_encrypted)
      `
    const gteDecoded = await Promise.all(
      gteRows.map((r) => storageCodec.decode(String(r.score))),
    )
    expect((gteDecoded as number[]).sort((a, b) => a - b)).toEqual([30, 40, 50])

    const [minTerm, maxTerm] = await Promise.all([
      oreTermCodec.encode(20),
      oreTermCodec.encode(40),
    ])
    const betweenRows = await sql`
        SELECT score FROM ${sql(TABLE_NAME)}
        WHERE eql_v2.gte(score, ${minTerm}::eql_v2_encrypted)
          AND eql_v2.lte(score, ${maxTerm}::eql_v2_encrypted)
      `
    const betweenDecoded = await Promise.all(
      betweenRows.map((r) => storageCodec.decode(String(r.score))),
    )
    expect((betweenDecoded as number[]).sort((a, b) => a - b)).toEqual([
      20, 30, 40,
    ])
  })
})

describeIntegration('codec integration: free-text search on strings', () => {
  const usersSchema = encryptedTable('protect_prisma_users_text', {
    email: encryptedColumn('email').freeTextSearch(),
  })
  const TABLE_NAME = `protect_prisma_text_${Date.now()}`

  let sql: ReturnType<typeof postgres>
  let storageCodec: ReturnType<typeof createEncryptedStorageCodec>
  let matchTermCodec: ReturnType<typeof createEncryptedMatchTermCodec>

  beforeAll(async () => {
    if (!DATABASE_URL) return
    sql = postgres(DATABASE_URL, { prepare: false })
    await sql`CREATE TABLE IF NOT EXISTS ${sql(TABLE_NAME)} (
      id serial PRIMARY KEY,
      email eql_v2_encrypted NOT NULL
    )`
    const client = await Encryption({ schemas: [usersSchema] })
    const ctx = buildContext(client, [usersSchema])
    storageCodec = createEncryptedStorageCodec(ctx)
    matchTermCodec = createEncryptedMatchTermCodec(ctx)
  })

  afterAll(async () => {
    if (sql) {
      await sql`DROP TABLE IF EXISTS ${sql(TABLE_NAME)}`
      await sql.end()
    }
  })

  it('round-trips ilike against an encrypted match index', async () => {
    const inputs = [
      'alice@example.com',
      'bob@other.org',
      'carol@example.com',
      'dave@example.org',
    ]
    const wires = await Promise.all(inputs.map((v) => storageCodec.encode(v)))
    for (const wire of wires) {
      await sql`INSERT INTO ${sql(TABLE_NAME)} (email) VALUES (${wire}::eql_v2_encrypted)`
    }

    const matchTerm = await matchTermCodec.encode('example.com')
    const rows = await sql`
      SELECT email FROM ${sql(TABLE_NAME)}
      WHERE eql_v2.ilike(email, ${matchTerm}::eql_v2_encrypted)
    `

    const decoded = (await Promise.all(
      rows.map((r) => storageCodec.decode(String(r.email))),
    )) as string[]
    expect(decoded.sort()).toEqual(['alice@example.com', 'carol@example.com'])
  })
})

describeIntegration(
  'codec integration: Date round-trip via SDK cast_as',
  () => {
    const datesSchema = encryptedTable('protect_prisma_dates', {
      created_at: encryptedColumn('created_at')
        .dataType('date')
        .orderAndRange(),
    })
    const TABLE_NAME = `protect_prisma_dates_${Date.now()}`

    let sql: ReturnType<typeof postgres>
    let storageCodec: ReturnType<typeof createEncryptedStorageCodec>
    let oreTermCodec: ReturnType<typeof createEncryptedOreTermCodec>

    beforeAll(async () => {
      if (!DATABASE_URL) return
      sql = postgres(DATABASE_URL, { prepare: false })
      await sql`CREATE TABLE IF NOT EXISTS ${sql(TABLE_NAME)} (
        id serial PRIMARY KEY,
        created_at eql_v2_encrypted NOT NULL
      )`
      const client = await Encryption({ schemas: [datesSchema] })
      const ctx = buildContext(client, [datesSchema])
      storageCodec = createEncryptedStorageCodec(ctx)
      oreTermCodec = createEncryptedOreTermCodec(ctx)
    })

    afterAll(async () => {
      if (sql) {
        await sql`DROP TABLE IF EXISTS ${sql(TABLE_NAME)}`
        await sql.end()
      }
    })

    it('encodes a Date as ISO string and decodes via SDK cast_as round-trip', async () => {
      const original = new Date('2026-04-27T12:00:00.000Z')
      const wire = await storageCodec.encode(original)
      await sql`INSERT INTO ${sql(TABLE_NAME)} (created_at) VALUES (${wire}::eql_v2_encrypted)`

      const rows = await sql`SELECT created_at FROM ${sql(TABLE_NAME)}`
      expect(rows).toHaveLength(1)
      const decoded = await storageCodec.decode(String(rows[0]?.created_at))
      // The SDK honors `cast_as: 'date'` and returns a Date instance.
      expect(decoded).toBeInstanceOf(Date)
      expect((decoded as Date).toISOString()).toBe(original.toISOString())
    })

    it('round-trips ORE comparisons on encrypted Date columns', async () => {
      const cutoff = new Date('2026-04-27T12:00:00.000Z')
      const cutoffTerm = await oreTermCodec.encode(cutoff)
      const rows = await sql`
        SELECT created_at FROM ${sql(TABLE_NAME)}
        WHERE eql_v2.gte(created_at, ${cutoffTerm}::eql_v2_encrypted)
      `
      expect(rows.length).toBeGreaterThanOrEqual(1)
    })
  },
)

describeIntegration(
  'codec integration: searchable JSON via STE-Vec selector',
  () => {
    const docsSchema = encryptedTable('protect_prisma_docs', {
      profile: encryptedColumn('profile').searchableJson(),
    })
    const TABLE_NAME = `protect_prisma_docs_${Date.now()}`

    let sql: ReturnType<typeof postgres>
    let storageCodec: ReturnType<typeof createEncryptedStorageCodec>
    let steVecCodec: ReturnType<typeof createEncryptedSteVecSelectorCodec>

    beforeAll(async () => {
      if (!DATABASE_URL) return
      sql = postgres(DATABASE_URL, { prepare: false })
      await sql`CREATE TABLE IF NOT EXISTS ${sql(TABLE_NAME)} (
        id serial PRIMARY KEY,
        profile eql_v2_encrypted NOT NULL
      )`
      const client = await Encryption({ schemas: [docsSchema] })
      const ctx = buildContext(client, [docsSchema])
      storageCodec = createEncryptedStorageCodec(ctx)
      steVecCodec = createEncryptedSteVecSelectorCodec(ctx)
    })

    afterAll(async () => {
      if (sql) {
        await sql`DROP TABLE IF EXISTS ${sql(TABLE_NAME)}`
        await sql.end()
      }
    })

    it('round-trips jsonb_path_exists against an encrypted searchable JSON column', async () => {
      const profiles = [
        { name: 'Alice', role: 'admin' },
        { name: 'Bob', role: 'user' },
      ]
      const wires = await Promise.all(
        profiles.map((v) => storageCodec.encode(v)),
      )
      for (const wire of wires) {
        await sql`INSERT INTO ${sql(TABLE_NAME)} (profile) VALUES (${wire}::eql_v2_encrypted)`
      }

      const selectorTerm = await steVecCodec.encode('$.role')
      const rows = await sql`
        SELECT profile FROM ${sql(TABLE_NAME)}
        WHERE eql_v2.jsonb_path_exists(profile, ${selectorTerm}::eql_v2_encrypted)
      `
      expect(rows.length).toBeGreaterThanOrEqual(1)
    })
  },
)
