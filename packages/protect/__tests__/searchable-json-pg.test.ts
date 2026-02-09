import 'dotenv/config'
import { csColumn, csTable } from '@cipherstash/schema'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { protect } from '../src'
import postgres from 'postgres'

if (!process.env.DATABASE_URL) {
  throw new Error('Missing env.DATABASE_URL')
}

// Disable prepared statements — required for pooled connections (PgBouncer in transaction mode)
const sql = postgres(process.env.DATABASE_URL, { prepare: false })

const table = csTable('protect-ci-jsonb', {
  metadata: csColumn('metadata').searchableJson(),
})

const TEST_RUN_ID = `test-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

type ProtectClient = Awaited<ReturnType<typeof protect>>
let protectClient: ProtectClient

beforeAll(async () => {
  protectClient = await protect({ schemas: [table] })

  await sql`
    CREATE TABLE IF NOT EXISTS "protect-ci-jsonb" (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      metadata eql_v2_encrypted,
      test_run_id TEXT
    )
  `
}, 30000)

afterAll(async () => {
  await sql`DELETE FROM "protect-ci-jsonb" WHERE test_run_id = ${TEST_RUN_ID}`
  await sql.end()
}, 30000)

describe('searchableJson postgres integration', () => {
  // ─── Storage: encrypt → insert → select → decrypt ──────────────────

  describe('storage: encrypt → insert → select → decrypt', () => {
    it('round-trips a flat JSON object', async () => {
      const plaintext = { user: { email: 'flat-rt@test.com' }, role: 'admin' }

      const encrypted = await protectClient.encryptModel({ metadata: plaintext }, table)
      if (encrypted.failure) throw new Error(encrypted.failure.message)

      const [inserted] = await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(encrypted.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
        RETURNING id
      `

      const rows = await sql`
        SELECT id, (metadata).data as metadata FROM "protect-ci-jsonb"
        WHERE id = ${inserted.id}
      `

      expect(rows).toHaveLength(1)

      const decrypted = await protectClient.decryptModel({ metadata: rows[0].metadata })
      if (decrypted.failure) throw new Error(decrypted.failure.message)

      expect(decrypted.data.metadata).toEqual(plaintext)
    }, 30000)

    it('round-trips nested JSON with arrays', async () => {
      const plaintext = {
        user: {
          profile: { role: 'admin', permissions: ['read', 'write'] },
          tags: [{ name: 'vip' }, { name: 'beta' }],
        },
        items: [{ id: 1, name: 'widget' }],
      }

      const encrypted = await protectClient.encryptModel({ metadata: plaintext }, table)
      if (encrypted.failure) throw new Error(encrypted.failure.message)

      const [inserted] = await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(encrypted.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
        RETURNING id
      `

      const rows = await sql`
        SELECT id, (metadata).data as metadata FROM "protect-ci-jsonb"
        WHERE id = ${inserted.id}
      `

      const decrypted = await protectClient.decryptModel({ metadata: rows[0].metadata })
      if (decrypted.failure) throw new Error(decrypted.failure.message)

      expect(decrypted.data.metadata).toEqual(plaintext)
    }, 30000)

    it('round-trips null values', async () => {
      const encrypted = await protectClient.encrypt(null, {
        column: table.metadata,
        table: table,
      })

      if (encrypted.failure) throw new Error(encrypted.failure.message)
      expect(encrypted.data).toBeNull()

      const [inserted] = await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (NULL, ${TEST_RUN_ID})
        RETURNING id
      `

      const rows = await sql`
        SELECT id, (metadata).data as metadata FROM "protect-ci-jsonb"
        WHERE id = ${inserted.id}
      `

      expect(rows).toHaveLength(1)
      expect(rows[0].metadata).toBeNull()
    }, 30000)
  })

  // ─── jsonb_path_query: path-based selector queries ─────────────────

  describe('jsonb_path_query: path-based selector queries', () => {
    it('finds row by simple top-level path ($.role)', async () => {
      const plaintext = { role: 'path-toplevel-test', extra: 'data' }

      const encrypted = await protectClient.encryptModel({ metadata: plaintext }, table)
      if (encrypted.failure) throw new Error(encrypted.failure.message)

      const [inserted] = await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(encrypted.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
        RETURNING id
      `

      const queryResult = await protectClient.encryptQuery('$.role', {
        column: table.metadata,
        table: table,
        queryType: 'steVecSelector',
        returnType: 'composite-literal',
      })
      if (queryResult.failure) throw new Error(queryResult.failure.message)
      const selectorTerm = queryResult.data

      const rows = await sql`
        SELECT id, (metadata).data as metadata
        FROM "protect-ci-jsonb" t,
             eql_v2.jsonb_path_query(t.metadata, ${selectorTerm}::eql_v2_encrypted) as result
        WHERE t.test_run_id = ${TEST_RUN_ID}
      `

      expect(rows.length).toBeGreaterThanOrEqual(1)
      const matchingRow = rows.find((r) => r.id === inserted.id)
      expect(matchingRow).toBeDefined()

      const decrypted = await protectClient.decryptModel({ metadata: matchingRow!.metadata })
      if (decrypted.failure) throw new Error(decrypted.failure.message)

      expect(decrypted.data.metadata).toEqual(plaintext)
    }, 30000)

    it('finds row by nested path ($.user.email)', async () => {
      const plaintext = { user: { email: 'nested-path@test.com' }, type: 'nested-path' }

      const encrypted = await protectClient.encryptModel({ metadata: plaintext }, table)
      if (encrypted.failure) throw new Error(encrypted.failure.message)

      const [inserted] = await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(encrypted.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
        RETURNING id
      `

      const queryResult = await protectClient.encryptQuery('$.user.email', {
        column: table.metadata,
        table: table,
        queryType: 'steVecSelector',
        returnType: 'composite-literal',
      })
      if (queryResult.failure) throw new Error(queryResult.failure.message)
      const selectorTerm = queryResult.data

      const rows = await sql`
        SELECT id, (metadata).data as metadata
        FROM "protect-ci-jsonb" t,
             eql_v2.jsonb_path_query(t.metadata, ${selectorTerm}::eql_v2_encrypted) as result
        WHERE t.test_run_id = ${TEST_RUN_ID}
      `

      expect(rows.length).toBeGreaterThanOrEqual(1)
      const matchingRow = rows.find((r) => r.id === inserted.id)
      expect(matchingRow).toBeDefined()

      const decrypted = await protectClient.decryptModel({ metadata: matchingRow!.metadata })
      if (decrypted.failure) throw new Error(decrypted.failure.message)

      expect(decrypted.data.metadata).toEqual(plaintext)
    }, 30000)

    it('finds row by deeply nested path ($.a.b.c)', async () => {
      const plaintext = { a: { b: { c: 'deep-value' } }, marker: 'deep-path' }

      const encrypted = await protectClient.encryptModel({ metadata: plaintext }, table)
      if (encrypted.failure) throw new Error(encrypted.failure.message)

      const [inserted] = await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(encrypted.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
        RETURNING id
      `

      const queryResult = await protectClient.encryptQuery('$.a.b.c', {
        column: table.metadata,
        table: table,
        queryType: 'steVecSelector',
        returnType: 'composite-literal',
      })
      if (queryResult.failure) throw new Error(queryResult.failure.message)
      const selectorTerm = queryResult.data

      const rows = await sql`
        SELECT id, (metadata).data as metadata
        FROM "protect-ci-jsonb" t,
             eql_v2.jsonb_path_query(t.metadata, ${selectorTerm}::eql_v2_encrypted) as result
        WHERE t.test_run_id = ${TEST_RUN_ID}
      `

      expect(rows.length).toBeGreaterThanOrEqual(1)
      const matchingRow = rows.find((r) => r.id === inserted.id)
      expect(matchingRow).toBeDefined()

      const decrypted = await protectClient.decryptModel({ metadata: matchingRow!.metadata })
      if (decrypted.failure) throw new Error(decrypted.failure.message)

      expect(decrypted.data.metadata).toEqual(plaintext)
    }, 30000)

    it('non-matching path returns zero rows', async () => {
      // Insert a doc that does NOT have $.nonexistent.path
      const plaintext = { exists: true, marker: 'no-match-test' }

      const encrypted = await protectClient.encryptModel({ metadata: plaintext }, table)
      if (encrypted.failure) throw new Error(encrypted.failure.message)

      await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(encrypted.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
      `

      const queryResult = await protectClient.encryptQuery('$.nonexistent.path', {
        column: table.metadata,
        table: table,
        queryType: 'steVecSelector',
        returnType: 'composite-literal',
      })
      if (queryResult.failure) throw new Error(queryResult.failure.message)
      const selectorTerm = queryResult.data

      const rows = await sql`
        SELECT id, (metadata).data as metadata
        FROM "protect-ci-jsonb" t,
             eql_v2.jsonb_path_query(t.metadata, ${selectorTerm}::eql_v2_encrypted) as result
        WHERE t.test_run_id = ${TEST_RUN_ID}
      `

      // No row should have this path
      expect(rows.length).toBe(0)
    }, 30000)

    it('multiple docs — only matching doc returned', async () => {
      // Insert two docs: one with $.target.value, one without
      const plaintextWithPath = { target: { value: 'found-it' }, marker: 'has-target' }
      const plaintextWithoutPath = { other: { key: 'nope' }, marker: 'no-target' }

      const encryptedWith = await protectClient.encryptModel({ metadata: plaintextWithPath }, table)
      if (encryptedWith.failure) throw new Error(encryptedWith.failure.message)

      const encryptedWithout = await protectClient.encryptModel({ metadata: plaintextWithoutPath }, table)
      if (encryptedWithout.failure) throw new Error(encryptedWithout.failure.message)

      const [insertedWith] = await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(encryptedWith.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
        RETURNING id
      `

      const [insertedWithout] = await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(encryptedWithout.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
        RETURNING id
      `

      const queryResult = await protectClient.encryptQuery('$.target.value', {
        column: table.metadata,
        table: table,
        queryType: 'steVecSelector',
        returnType: 'composite-literal',
      })
      if (queryResult.failure) throw new Error(queryResult.failure.message)
      const selectorTerm = queryResult.data

      const rows = await sql`
        SELECT id, (metadata).data as metadata
        FROM "protect-ci-jsonb" t,
             eql_v2.jsonb_path_query(t.metadata, ${selectorTerm}::eql_v2_encrypted) as result
        WHERE t.test_run_id = ${TEST_RUN_ID}
      `

      // The doc with $.target.value should be found
      const matchingRow = rows.find((r) => r.id === insertedWith.id)
      expect(matchingRow).toBeDefined()

      // The doc without $.target.value should NOT be found
      const nonMatchingRow = rows.find((r) => r.id === insertedWithout.id)
      expect(nonMatchingRow).toBeUndefined()

      // Decrypt and verify the matching row
      const decrypted = await protectClient.decryptModel({ metadata: matchingRow!.metadata })
      if (decrypted.failure) throw new Error(decrypted.failure.message)

      expect(decrypted.data.metadata).toEqual(plaintextWithPath)
    }, 30000)
  })

  // ─── Containment: @> term queries ──────────────────────────────────

  describe('containment: @> term queries', () => {
    it('matches by key/value pair', async () => {
      const plaintext = { role: 'admin-containment', department: 'engineering' }

      const encrypted = await protectClient.encryptModel({ metadata: plaintext }, table)
      if (encrypted.failure) throw new Error(encrypted.failure.message)

      const [inserted] = await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(encrypted.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
        RETURNING id
      `

      const queryResult = await protectClient.encryptQuery({ role: 'admin-containment' }, {
        column: table.metadata,
        table: table,
        queryType: 'steVecTerm',
        returnType: 'composite-literal',
      })
      if (queryResult.failure) throw new Error(queryResult.failure.message)
      const containmentTerm = queryResult.data

      const rows = await sql`
        SELECT id, (metadata).data as metadata
        FROM "protect-ci-jsonb"
        WHERE metadata @> ${containmentTerm}::eql_v2_encrypted
        AND test_run_id = ${TEST_RUN_ID}
      `

      expect(rows.length).toBeGreaterThanOrEqual(1)
      const matchingRow = rows.find((r) => r.id === inserted.id)
      expect(matchingRow).toBeDefined()

      const decrypted = await protectClient.decryptModel({ metadata: matchingRow!.metadata })
      if (decrypted.failure) throw new Error(decrypted.failure.message)

      expect(decrypted.data.metadata).toEqual(plaintext)
    }, 30000)

    it('matches by nested object structure', async () => {
      const plaintext = { user: { profile: { role: 'superadmin' } }, active: true }

      const encrypted = await protectClient.encryptModel({ metadata: plaintext }, table)
      if (encrypted.failure) throw new Error(encrypted.failure.message)

      const [inserted] = await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(encrypted.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
        RETURNING id
      `

      const queryResult = await protectClient.encryptQuery({ user: { profile: { role: 'superadmin' } } }, {
        column: table.metadata,
        table: table,
        queryType: 'steVecTerm',
        returnType: 'composite-literal',
      })
      if (queryResult.failure) throw new Error(queryResult.failure.message)
      const containmentTerm = queryResult.data

      const rows = await sql`
        SELECT id, (metadata).data as metadata
        FROM "protect-ci-jsonb"
        WHERE metadata @> ${containmentTerm}::eql_v2_encrypted
        AND test_run_id = ${TEST_RUN_ID}
      `

      expect(rows.length).toBeGreaterThanOrEqual(1)
      const matchingRow = rows.find((r) => r.id === inserted.id)
      expect(matchingRow).toBeDefined()

      const decrypted = await protectClient.decryptModel({ metadata: matchingRow!.metadata })
      if (decrypted.failure) throw new Error(decrypted.failure.message)

      expect(decrypted.data.metadata).toEqual(plaintext)
    }, 30000)

    it('non-matching term returns zero rows', async () => {
      const plaintext = { status: 'active', tier: 'free' }

      const encrypted = await protectClient.encryptModel({ metadata: plaintext }, table)
      if (encrypted.failure) throw new Error(encrypted.failure.message)

      await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(encrypted.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
      `

      const queryResult = await protectClient.encryptQuery({ status: 'nonexistent-value-xyz' }, {
        column: table.metadata,
        table: table,
        queryType: 'steVecTerm',
        returnType: 'composite-literal',
      })
      if (queryResult.failure) throw new Error(queryResult.failure.message)
      const containmentTerm = queryResult.data

      const rows = await sql`
        SELECT id, (metadata).data as metadata
        FROM "protect-ci-jsonb"
        WHERE metadata @> ${containmentTerm}::eql_v2_encrypted
        AND test_run_id = ${TEST_RUN_ID}
      `

      expect(rows.length).toBe(0)
    }, 30000)
  })

  // ─── Mixed and batch operations ────────────────────────────────────

  describe('mixed and batch operations', () => {
    it('batch encrypts selector + containment terms together', async () => {
      const plaintext = { user: { email: 'batch@test.com' }, role: 'editor', kind: 'batch-mixed' }

      const encrypted = await protectClient.encryptModel({ metadata: plaintext }, table)
      if (encrypted.failure) throw new Error(encrypted.failure.message)

      const [inserted] = await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(encrypted.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
        RETURNING id
      `

      const queryResult = await protectClient.encryptQuery([
        {
          value: '$.user.email',
          column: table.metadata,
          table: table,
          queryType: 'steVecSelector',
          returnType: 'composite-literal',
        },
        {
          value: { role: 'editor' },
          column: table.metadata,
          table: table,
          queryType: 'steVecTerm',
          returnType: 'composite-literal',
        },
      ])

      if (queryResult.failure) throw new Error(queryResult.failure.message)
      const [selectorTerm, containmentTerm] = queryResult.data

      // Selector query: jsonb_path_query
      const selectorRows = await sql`
        SELECT id, (metadata).data as metadata
        FROM "protect-ci-jsonb" t,
             eql_v2.jsonb_path_query(t.metadata, ${selectorTerm}::eql_v2_encrypted) as result
        WHERE t.test_run_id = ${TEST_RUN_ID}
      `

      expect(selectorRows.length).toBeGreaterThanOrEqual(1)
      const selectorMatch = selectorRows.find((r) => r.id === inserted.id)
      expect(selectorMatch).toBeDefined()

      const selectorDecrypted = await protectClient.decryptModel({ metadata: selectorMatch!.metadata })
      if (selectorDecrypted.failure) throw new Error(selectorDecrypted.failure.message)
      expect(selectorDecrypted.data.metadata).toEqual(plaintext)

      // Containment query: @>
      const containmentRows = await sql`
        SELECT id, (metadata).data as metadata
        FROM "protect-ci-jsonb"
        WHERE metadata @> ${containmentTerm}::eql_v2_encrypted
        AND test_run_id = ${TEST_RUN_ID}
      `

      expect(containmentRows.length).toBeGreaterThanOrEqual(1)
      const containmentMatch = containmentRows.find((r) => r.id === inserted.id)
      expect(containmentMatch).toBeDefined()

      const containmentDecrypted = await protectClient.decryptModel({ metadata: containmentMatch!.metadata })
      if (containmentDecrypted.failure) throw new Error(containmentDecrypted.failure.message)
      expect(containmentDecrypted.data.metadata).toEqual(plaintext)
    }, 30000)

    it('inferred vs explicit queryType produce same results', async () => {
      const plaintext = { category: 'equivalence-test', priority: 'high' }

      const encrypted = await protectClient.encryptModel({ metadata: plaintext }, table)
      if (encrypted.failure) throw new Error(encrypted.failure.message)

      const [inserted] = await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(encrypted.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
        RETURNING id
      `

      // Selector: inferred (searchableJson) vs explicit (steVecSelector)
      const inferredSelectorResult = await protectClient.encryptQuery('$.category', {
        column: table.metadata,
        table: table,
        queryType: 'searchableJson',
        returnType: 'composite-literal',
      })
      if (inferredSelectorResult.failure) throw new Error(inferredSelectorResult.failure.message)
      const inferredSelectorTerm = inferredSelectorResult.data

      const explicitSelectorResult = await protectClient.encryptQuery('$.category', {
        column: table.metadata,
        table: table,
        queryType: 'steVecSelector',
        returnType: 'composite-literal',
      })
      if (explicitSelectorResult.failure) throw new Error(explicitSelectorResult.failure.message)
      const explicitSelectorTerm = explicitSelectorResult.data

      const inferredRows = await sql`
        SELECT id, (metadata).data as metadata
        FROM "protect-ci-jsonb" t,
             eql_v2.jsonb_path_query(t.metadata, ${inferredSelectorTerm}::eql_v2_encrypted) as result
        WHERE t.test_run_id = ${TEST_RUN_ID}
      `

      const explicitRows = await sql`
        SELECT id, (metadata).data as metadata
        FROM "protect-ci-jsonb" t,
             eql_v2.jsonb_path_query(t.metadata, ${explicitSelectorTerm}::eql_v2_encrypted) as result
        WHERE t.test_run_id = ${TEST_RUN_ID}
      `

      expect(inferredRows.length).toBe(explicitRows.length)
      expect(inferredRows.length).toBeGreaterThanOrEqual(1)

      // Both should find our inserted row
      const inferredMatch = inferredRows.find((r) => r.id === inserted.id)
      const explicitMatch = explicitRows.find((r) => r.id === inserted.id)
      expect(inferredMatch).toBeDefined()
      expect(explicitMatch).toBeDefined()

      // Decrypt and compare — both should yield identical plaintext
      const inferredDecrypted = await protectClient.decryptModel({ metadata: inferredMatch!.metadata })
      const explicitDecrypted = await protectClient.decryptModel({ metadata: explicitMatch!.metadata })
      if (inferredDecrypted.failure) throw new Error(inferredDecrypted.failure.message)
      if (explicitDecrypted.failure) throw new Error(explicitDecrypted.failure.message)

      expect(inferredDecrypted.data.metadata).toEqual(explicitDecrypted.data.metadata)
      expect(inferredDecrypted.data.metadata).toEqual(plaintext)

      // Containment: inferred (searchableJson) vs explicit (steVecTerm)
      const inferredTermResult = await protectClient.encryptQuery({ category: 'equivalence-test' }, {
        column: table.metadata,
        table: table,
        queryType: 'searchableJson',
        returnType: 'composite-literal',
      })
      if (inferredTermResult.failure) throw new Error(inferredTermResult.failure.message)
      const inferredContainmentTerm = inferredTermResult.data

      const explicitTermResult = await protectClient.encryptQuery({ category: 'equivalence-test' }, {
        column: table.metadata,
        table: table,
        queryType: 'steVecTerm',
        returnType: 'composite-literal',
      })
      if (explicitTermResult.failure) throw new Error(explicitTermResult.failure.message)
      const explicitContainmentTerm = explicitTermResult.data

      const inferredTermRows = await sql`
        SELECT id, (metadata).data as metadata
        FROM "protect-ci-jsonb"
        WHERE metadata @> ${inferredContainmentTerm}::eql_v2_encrypted
        AND test_run_id = ${TEST_RUN_ID}
      `

      const explicitTermRows = await sql`
        SELECT id, (metadata).data as metadata
        FROM "protect-ci-jsonb"
        WHERE metadata @> ${explicitContainmentTerm}::eql_v2_encrypted
        AND test_run_id = ${TEST_RUN_ID}
      `

      expect(inferredTermRows.length).toBe(explicitTermRows.length)
      expect(inferredTermRows.length).toBeGreaterThanOrEqual(1)

      const inferredTermMatch = inferredTermRows.find((r) => r.id === inserted.id)
      const explicitTermMatch = explicitTermRows.find((r) => r.id === inserted.id)
      expect(inferredTermMatch).toBeDefined()
      expect(explicitTermMatch).toBeDefined()

      const inferredTermDecrypted = await protectClient.decryptModel({ metadata: inferredTermMatch!.metadata })
      const explicitTermDecrypted = await protectClient.decryptModel({ metadata: explicitTermMatch!.metadata })
      if (inferredTermDecrypted.failure) throw new Error(inferredTermDecrypted.failure.message)
      if (explicitTermDecrypted.failure) throw new Error(explicitTermDecrypted.failure.message)

      expect(inferredTermDecrypted.data.metadata).toEqual(explicitTermDecrypted.data.metadata)
      expect(inferredTermDecrypted.data.metadata).toEqual(plaintext)
    }, 30000)
  })
})
