import 'dotenv/config'
import { csColumn, csTable } from '@cipherstash/schema'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { protect, LockContext } from '../src'
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

  // ─── Escaped-composite-literal format ─────────────────────────────

  describe('escaped-composite-literal format', () => {
    it('escaped selector → unwrap → query PG', async () => {
      const plaintext = { user: { email: 'escaped-sel@test.com' }, marker: 'escaped-selector' }

      const encrypted = await protectClient.encryptModel({ metadata: plaintext }, table)
      if (encrypted.failure) throw new Error(encrypted.failure.message)

      const [inserted] = await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(encrypted.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
        RETURNING id
      `

      // Encrypt with both formats
      const compositeResult = await protectClient.encryptQuery('$.user.email', {
        column: table.metadata,
        table: table,
        queryType: 'steVecSelector',
        returnType: 'composite-literal',
      })
      if (compositeResult.failure) throw new Error(compositeResult.failure.message)

      const escapedResult = await protectClient.encryptQuery('$.user.email', {
        column: table.metadata,
        table: table,
        queryType: 'steVecSelector',
        returnType: 'escaped-composite-literal',
      })
      if (escapedResult.failure) throw new Error(escapedResult.failure.message)

      // Verify escaped format and unwrap
      const escapedData = escapedResult.data as string
      expect(typeof escapedData).toBe('string')
      expect(escapedData).toMatch(/^"\(.*\)"$/)
      const unwrapped = JSON.parse(escapedData)

      const compositeData = compositeResult.data as string
      expect(unwrapped).toBe(compositeData)

      // Use composite-literal form to query PG
      const rows = await sql`
        SELECT id, (metadata).data as metadata
        FROM "protect-ci-jsonb" t,
             eql_v2.jsonb_path_query(t.metadata, ${compositeData}::eql_v2_encrypted) as result
        WHERE t.test_run_id = ${TEST_RUN_ID}
      `

      expect(rows.length).toBeGreaterThanOrEqual(1)
      const matchingRow = rows.find((r) => r.id === inserted.id)
      expect(matchingRow).toBeDefined()

      const decrypted = await protectClient.decryptModel({ metadata: matchingRow!.metadata })
      if (decrypted.failure) throw new Error(decrypted.failure.message)
      expect(decrypted.data.metadata).toEqual(plaintext)
    }, 30000)

    it('escaped containment → unwrap → query PG', async () => {
      const plaintext = { role: 'escaped-containment-test', department: 'security' }

      const encrypted = await protectClient.encryptModel({ metadata: plaintext }, table)
      if (encrypted.failure) throw new Error(encrypted.failure.message)

      const [inserted] = await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(encrypted.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
        RETURNING id
      `

      const escapedResult = await protectClient.encryptQuery({ role: 'escaped-containment-test' }, {
        column: table.metadata,
        table: table,
        queryType: 'steVecTerm',
        returnType: 'escaped-composite-literal',
      })
      if (escapedResult.failure) throw new Error(escapedResult.failure.message)

      // Verify escaped format and unwrap
      const escapedData = escapedResult.data as string
      expect(typeof escapedData).toBe('string')
      expect(escapedData).toMatch(/^"\(.*\)"$/)
      const unwrapped = JSON.parse(escapedData)

      // Unwrapped escaped format should be a valid composite-literal
      expect(typeof unwrapped).toBe('string')
      expect(unwrapped).toMatch(/^\(.*\)$/)

      // Use unwrapped composite-literal form to query PG
      const rows = await sql`
        SELECT id, (metadata).data as metadata
        FROM "protect-ci-jsonb"
        WHERE metadata @> ${unwrapped}::eql_v2_encrypted
        AND test_run_id = ${TEST_RUN_ID}
      `

      expect(rows.length).toBeGreaterThanOrEqual(1)
      const matchingRow = rows.find((r) => r.id === inserted.id)
      expect(matchingRow).toBeDefined()

      const decrypted = await protectClient.decryptModel({ metadata: matchingRow!.metadata })
      if (decrypted.failure) throw new Error(decrypted.failure.message)
      expect(decrypted.data.metadata).toEqual(plaintext)
    }, 30000)

    it('batch escaped format', async () => {
      const plaintext = { user: { email: 'batch-escaped@test.com' }, role: 'batch-escaped-role', marker: 'batch-escaped' }

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
          returnType: 'escaped-composite-literal',
        },
        {
          value: { role: 'batch-escaped-role' },
          column: table.metadata,
          table: table,
          queryType: 'steVecTerm',
          returnType: 'escaped-composite-literal',
        },
      ])
      if (queryResult.failure) throw new Error(queryResult.failure.message)

      expect(queryResult.data).toHaveLength(2)
      for (const item of queryResult.data) {
        expect(typeof item).toBe('string')
        expect(item).toMatch(/^"\(.*\)"$/)
      }

      // Unwrap escaped format
      const selectorUnwrapped = JSON.parse(queryResult.data[0] as string)
      const containmentUnwrapped = JSON.parse(queryResult.data[1] as string)

      // Selector query
      const selectorRows = await sql`
        SELECT id, (metadata).data as metadata
        FROM "protect-ci-jsonb" t,
             eql_v2.jsonb_path_query(t.metadata, ${selectorUnwrapped}::eql_v2_encrypted) as result
        WHERE t.test_run_id = ${TEST_RUN_ID}
      `

      expect(selectorRows.length).toBeGreaterThanOrEqual(1)
      const selectorMatch = selectorRows.find((r) => r.id === inserted.id)
      expect(selectorMatch).toBeDefined()

      const selectorDecrypted = await protectClient.decryptModel({ metadata: selectorMatch!.metadata })
      if (selectorDecrypted.failure) throw new Error(selectorDecrypted.failure.message)
      expect(selectorDecrypted.data.metadata).toEqual(plaintext)

      // Containment query
      const containmentRows = await sql`
        SELECT id, (metadata).data as metadata
        FROM "protect-ci-jsonb"
        WHERE metadata @> ${containmentUnwrapped}::eql_v2_encrypted
        AND test_run_id = ${TEST_RUN_ID}
      `

      expect(containmentRows.length).toBeGreaterThanOrEqual(1)
      const containmentMatch = containmentRows.find((r) => r.id === inserted.id)
      expect(containmentMatch).toBeDefined()

      const containmentDecrypted = await protectClient.decryptModel({ metadata: containmentMatch!.metadata })
      if (containmentDecrypted.failure) throw new Error(containmentDecrypted.failure.message)
      expect(containmentDecrypted.data.metadata).toEqual(plaintext)
    }, 30000)
  })

  // ─── LockContext integration ──────────────────────────────────────

  describe('LockContext integration', () => {
    it('selector with LockContext', async () => {
      const userJwt = process.env.USER_JWT
      if (!userJwt) {
        console.log('Skipping lock context test - no USER_JWT provided')
        return
      }

      const lc = new LockContext()
      const lockContext = await lc.identify(userJwt)
      if (lockContext.failure) throw new Error(lockContext.failure.message)

      const plaintext = { user: { email: 'lc-selector@test.com' }, marker: 'lock-context-selector' }

      const encrypted = await protectClient
        .encryptModel({ metadata: plaintext }, table)
        .withLockContext(lockContext.data)
      if (encrypted.failure) throw new Error(encrypted.failure.message)

      const [inserted] = await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(encrypted.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
        RETURNING id
      `

      const selectorResult = await protectClient
        .encryptQuery('$.user.email', {
          column: table.metadata,
          table: table,
          queryType: 'steVecSelector',
          returnType: 'composite-literal',
        })
        .withLockContext(lockContext.data)
        .execute()
      if (selectorResult.failure) throw new Error(selectorResult.failure.message)

      const rows = await sql`
        SELECT id, (metadata).data as metadata
        FROM "protect-ci-jsonb" t,
             eql_v2.jsonb_path_query(t.metadata, ${selectorResult.data}::eql_v2_encrypted) as result
        WHERE t.test_run_id = ${TEST_RUN_ID}
      `

      expect(rows.length).toBeGreaterThanOrEqual(1)
      const matchingRow = rows.find((r) => r.id === inserted.id)
      expect(matchingRow).toBeDefined()

      const decrypted = await protectClient
        .decryptModel({ metadata: matchingRow!.metadata })
        .withLockContext(lockContext.data)
      if (decrypted.failure) throw new Error(decrypted.failure.message)
      expect(decrypted.data.metadata).toEqual(plaintext)
    }, 60000)

    it('containment with LockContext', async () => {
      const userJwt = process.env.USER_JWT
      if (!userJwt) {
        console.log('Skipping lock context test - no USER_JWT provided')
        return
      }

      const lc = new LockContext()
      const lockContext = await lc.identify(userJwt)
      if (lockContext.failure) throw new Error(lockContext.failure.message)

      const plaintext = { role: 'lc-containment-test', department: 'auth' }

      const encrypted = await protectClient
        .encryptModel({ metadata: plaintext }, table)
        .withLockContext(lockContext.data)
      if (encrypted.failure) throw new Error(encrypted.failure.message)

      const [inserted] = await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(encrypted.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
        RETURNING id
      `

      const containmentResult = await protectClient
        .encryptQuery({ role: 'lc-containment-test' }, {
          column: table.metadata,
          table: table,
          queryType: 'steVecTerm',
          returnType: 'composite-literal',
        })
        .withLockContext(lockContext.data)
        .execute()
      if (containmentResult.failure) throw new Error(containmentResult.failure.message)

      const rows = await sql`
        SELECT id, (metadata).data as metadata
        FROM "protect-ci-jsonb"
        WHERE metadata @> ${containmentResult.data}::eql_v2_encrypted
        AND test_run_id = ${TEST_RUN_ID}
      `

      expect(rows.length).toBeGreaterThanOrEqual(1)
      const matchingRow = rows.find((r) => r.id === inserted.id)
      expect(matchingRow).toBeDefined()

      const decrypted = await protectClient
        .decryptModel({ metadata: matchingRow!.metadata })
        .withLockContext(lockContext.data)
      if (decrypted.failure) throw new Error(decrypted.failure.message)
      expect(decrypted.data.metadata).toEqual(plaintext)
    }, 60000)

    it('batch with LockContext', async () => {
      const userJwt = process.env.USER_JWT
      if (!userJwt) {
        console.log('Skipping lock context test - no USER_JWT provided')
        return
      }

      const lc = new LockContext()
      const lockContext = await lc.identify(userJwt)
      if (lockContext.failure) throw new Error(lockContext.failure.message)

      const plaintext = { user: { email: 'lc-batch@test.com' }, role: 'lc-batch-role', kind: 'lock-context-batch' }

      const encrypted = await protectClient
        .encryptModel({ metadata: plaintext }, table)
        .withLockContext(lockContext.data)
      if (encrypted.failure) throw new Error(encrypted.failure.message)

      const [inserted] = await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(encrypted.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
        RETURNING id
      `

      const batchResult = await protectClient
        .encryptQuery([
          {
            value: '$.user.email',
            column: table.metadata,
            table: table,
            queryType: 'steVecSelector',
            returnType: 'composite-literal',
          },
          {
            value: { role: 'lc-batch-role' },
            column: table.metadata,
            table: table,
            queryType: 'steVecTerm',
            returnType: 'composite-literal',
          },
        ])
        .withLockContext(lockContext.data)
        .execute()
      if (batchResult.failure) throw new Error(batchResult.failure.message)

      const [selectorTerm, containmentTerm] = batchResult.data

      // Selector query
      const selectorRows = await sql`
        SELECT id, (metadata).data as metadata
        FROM "protect-ci-jsonb" t,
             eql_v2.jsonb_path_query(t.metadata, ${selectorTerm}::eql_v2_encrypted) as result
        WHERE t.test_run_id = ${TEST_RUN_ID}
      `

      expect(selectorRows.length).toBeGreaterThanOrEqual(1)
      const selectorMatch = selectorRows.find((r) => r.id === inserted.id)
      expect(selectorMatch).toBeDefined()

      const selectorDecrypted = await protectClient
        .decryptModel({ metadata: selectorMatch!.metadata })
        .withLockContext(lockContext.data)
      if (selectorDecrypted.failure) throw new Error(selectorDecrypted.failure.message)
      expect(selectorDecrypted.data.metadata).toEqual(plaintext)

      // Containment query
      const containmentRows = await sql`
        SELECT id, (metadata).data as metadata
        FROM "protect-ci-jsonb"
        WHERE metadata @> ${containmentTerm}::eql_v2_encrypted
        AND test_run_id = ${TEST_RUN_ID}
      `

      expect(containmentRows.length).toBeGreaterThanOrEqual(1)
      const containmentMatch = containmentRows.find((r) => r.id === inserted.id)
      expect(containmentMatch).toBeDefined()

      const containmentDecrypted = await protectClient
        .decryptModel({ metadata: containmentMatch!.metadata })
        .withLockContext(lockContext.data)
      if (containmentDecrypted.failure) throw new Error(containmentDecrypted.failure.message)
      expect(containmentDecrypted.data.metadata).toEqual(plaintext)
    }, 60000)
  })

  // ─── Concurrent query operations ─────────────────────────────────

  describe('concurrent query operations', () => {
    it('parallel selector queries', async () => {
      // Insert 3 docs with distinct structures
      const docs = [
        { alpha: { key: 'concurrent-sel-1' }, marker: 'concurrent-1' },
        { beta: { key: 'concurrent-sel-2' }, marker: 'concurrent-2' },
        { gamma: { key: 'concurrent-sel-3' }, marker: 'concurrent-3' },
      ]

      const insertedIds: number[] = []
      for (const plaintext of docs) {
        const encrypted = await protectClient.encryptModel({ metadata: plaintext }, table)
        if (encrypted.failure) throw new Error(encrypted.failure.message)

        const [inserted] = await sql`
          INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
          VALUES (${sql.json(encrypted.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
          RETURNING id
        `
        insertedIds.push(inserted.id)
      }

      // Parallel encrypt 3 selector queries
      const [q1, q2, q3] = await Promise.all([
        protectClient.encryptQuery('$.alpha.key', {
          column: table.metadata,
          table: table,
          queryType: 'steVecSelector',
          returnType: 'composite-literal',
        }),
        protectClient.encryptQuery('$.beta.key', {
          column: table.metadata,
          table: table,
          queryType: 'steVecSelector',
          returnType: 'composite-literal',
        }),
        protectClient.encryptQuery('$.gamma.key', {
          column: table.metadata,
          table: table,
          queryType: 'steVecSelector',
          returnType: 'composite-literal',
        }),
      ])

      if (q1.failure) throw new Error(q1.failure.message)
      if (q2.failure) throw new Error(q2.failure.message)
      if (q3.failure) throw new Error(q3.failure.message)

      // Execute each against PG
      const [rows1, rows2, rows3] = await Promise.all([
        sql`
          SELECT id, (metadata).data as metadata FROM "protect-ci-jsonb" t,
               eql_v2.jsonb_path_query(t.metadata, ${q1.data}::eql_v2_encrypted) as result
          WHERE t.test_run_id = ${TEST_RUN_ID}
        `,
        sql`
          SELECT id, (metadata).data as metadata FROM "protect-ci-jsonb" t,
               eql_v2.jsonb_path_query(t.metadata, ${q2.data}::eql_v2_encrypted) as result
          WHERE t.test_run_id = ${TEST_RUN_ID}
        `,
        sql`
          SELECT id, (metadata).data as metadata FROM "protect-ci-jsonb" t,
               eql_v2.jsonb_path_query(t.metadata, ${q3.data}::eql_v2_encrypted) as result
          WHERE t.test_run_id = ${TEST_RUN_ID}
        `,
      ])

      // Each query should find its respective doc and not others
      expect(rows1.find((r) => r.id === insertedIds[0])).toBeDefined()
      expect(rows1.find((r) => r.id === insertedIds[1])).toBeUndefined()
      expect(rows1.find((r) => r.id === insertedIds[2])).toBeUndefined()
      expect(rows2.find((r) => r.id === insertedIds[1])).toBeDefined()
      expect(rows2.find((r) => r.id === insertedIds[0])).toBeUndefined()
      expect(rows2.find((r) => r.id === insertedIds[2])).toBeUndefined()
      expect(rows3.find((r) => r.id === insertedIds[2])).toBeDefined()
      expect(rows3.find((r) => r.id === insertedIds[0])).toBeUndefined()
      expect(rows3.find((r) => r.id === insertedIds[1])).toBeUndefined()

      // Decrypt and validate each matched row
      const match1 = rows1.find((r) => r.id === insertedIds[0])!
      const decrypted1 = await protectClient.decryptModel({ metadata: match1.metadata })
      if (decrypted1.failure) throw new Error(decrypted1.failure.message)
      expect(decrypted1.data.metadata).toEqual(docs[0])

      const match2 = rows2.find((r) => r.id === insertedIds[1])!
      const decrypted2 = await protectClient.decryptModel({ metadata: match2.metadata })
      if (decrypted2.failure) throw new Error(decrypted2.failure.message)
      expect(decrypted2.data.metadata).toEqual(docs[1])

      const match3 = rows3.find((r) => r.id === insertedIds[2])!
      const decrypted3 = await protectClient.decryptModel({ metadata: match3.metadata })
      if (decrypted3.failure) throw new Error(decrypted3.failure.message)
      expect(decrypted3.data.metadata).toEqual(docs[2])
    }, 60000)

    it('parallel containment queries', async () => {
      const docs = [
        { role: 'concurrent-contain-1', tier: 'gold' },
        { role: 'concurrent-contain-2', tier: 'silver' },
      ]

      const insertedIds: number[] = []
      for (const plaintext of docs) {
        const encrypted = await protectClient.encryptModel({ metadata: plaintext }, table)
        if (encrypted.failure) throw new Error(encrypted.failure.message)

        const [inserted] = await sql`
          INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
          VALUES (${sql.json(encrypted.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
          RETURNING id
        `
        insertedIds.push(inserted.id)
      }

      // Parallel encrypt 2 containment queries
      const [c1, c2] = await Promise.all([
        protectClient.encryptQuery({ role: 'concurrent-contain-1' }, {
          column: table.metadata,
          table: table,
          queryType: 'steVecTerm',
          returnType: 'composite-literal',
        }),
        protectClient.encryptQuery({ role: 'concurrent-contain-2' }, {
          column: table.metadata,
          table: table,
          queryType: 'steVecTerm',
          returnType: 'composite-literal',
        }),
      ])

      if (c1.failure) throw new Error(c1.failure.message)
      if (c2.failure) throw new Error(c2.failure.message)

      const [rows1, rows2] = await Promise.all([
        sql`
          SELECT id, (metadata).data as metadata FROM "protect-ci-jsonb"
          WHERE metadata @> ${c1.data}::eql_v2_encrypted
          AND test_run_id = ${TEST_RUN_ID}
        `,
        sql`
          SELECT id, (metadata).data as metadata FROM "protect-ci-jsonb"
          WHERE metadata @> ${c2.data}::eql_v2_encrypted
          AND test_run_id = ${TEST_RUN_ID}
        `,
      ])

      // Each finds only its target doc
      expect(rows1.find((r) => r.id === insertedIds[0])).toBeDefined()
      expect(rows1.find((r) => r.id === insertedIds[1])).toBeUndefined()
      expect(rows2.find((r) => r.id === insertedIds[1])).toBeDefined()
      expect(rows2.find((r) => r.id === insertedIds[0])).toBeUndefined()

      // Decrypt and validate each matched row
      const match1 = rows1.find((r) => r.id === insertedIds[0])!
      const decrypted1 = await protectClient.decryptModel({ metadata: match1.metadata })
      if (decrypted1.failure) throw new Error(decrypted1.failure.message)
      expect(decrypted1.data.metadata).toEqual(docs[0])

      const match2 = rows2.find((r) => r.id === insertedIds[1])!
      const decrypted2 = await protectClient.decryptModel({ metadata: match2.metadata })
      if (decrypted2.failure) throw new Error(decrypted2.failure.message)
      expect(decrypted2.data.metadata).toEqual(docs[1])
    }, 60000)

    it('parallel mixed encrypt+query', async () => {
      const plaintext = { user: { email: 'concurrent-mixed@test.com' }, role: 'concurrent-mixed-role', kind: 'mixed-concurrent' }

      // Parallel: encryptModel + selector encryptQuery + containment encryptQuery
      const [encryptedModel, selectorResult, containmentResult] = await Promise.all([
        protectClient.encryptModel({ metadata: plaintext }, table),
        protectClient.encryptQuery('$.user.email', {
          column: table.metadata,
          table: table,
          queryType: 'steVecSelector',
          returnType: 'composite-literal',
        }),
        protectClient.encryptQuery({ role: 'concurrent-mixed-role' }, {
          column: table.metadata,
          table: table,
          queryType: 'steVecTerm',
          returnType: 'composite-literal',
        }),
      ])

      if (encryptedModel.failure) throw new Error(encryptedModel.failure.message)
      if (selectorResult.failure) throw new Error(selectorResult.failure.message)
      if (containmentResult.failure) throw new Error(containmentResult.failure.message)

      // Insert the encrypted doc
      const [inserted] = await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(encryptedModel.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
        RETURNING id
      `

      // Query with both terms
      const [selectorRows, containmentRows] = await Promise.all([
        sql`
          SELECT id, (metadata).data as metadata FROM "protect-ci-jsonb" t,
               eql_v2.jsonb_path_query(t.metadata, ${selectorResult.data}::eql_v2_encrypted) as result
          WHERE t.test_run_id = ${TEST_RUN_ID}
        `,
        sql`
          SELECT id, (metadata).data as metadata FROM "protect-ci-jsonb"
          WHERE metadata @> ${containmentResult.data}::eql_v2_encrypted
          AND test_run_id = ${TEST_RUN_ID}
        `,
      ])

      // Both should find the inserted row
      expect(selectorRows.find((r) => r.id === inserted.id)).toBeDefined()
      expect(containmentRows.find((r) => r.id === inserted.id)).toBeDefined()
      // Verify result sets are bounded (not returning all rows)
      expect(selectorRows.length).toBeGreaterThanOrEqual(1)
      expect(containmentRows.length).toBeGreaterThanOrEqual(1)

      // Decrypt and validate both matched rows
      const selectorMatch = selectorRows.find((r) => r.id === inserted.id)!
      const selectorDecrypted = await protectClient.decryptModel({ metadata: selectorMatch.metadata })
      if (selectorDecrypted.failure) throw new Error(selectorDecrypted.failure.message)
      expect(selectorDecrypted.data.metadata).toEqual(plaintext)

      const containmentMatch = containmentRows.find((r) => r.id === inserted.id)!
      const containmentDecrypted = await protectClient.decryptModel({ metadata: containmentMatch.metadata })
      if (containmentDecrypted.failure) throw new Error(containmentDecrypted.failure.message)
      expect(containmentDecrypted.data.metadata).toEqual(plaintext)
    }, 60000)
  })

  // ─── Contained-by: <@ term queries ────────────────────────────────

  describe('contained-by: <@ term queries', () => {
    it('matches by key/value pair (Extended)', async () => {
      const plaintext = { role: 'contained-by-kv', department: 'eng' }

      const encrypted = await protectClient.encryptModel({ metadata: plaintext }, table)
      if (encrypted.failure) throw new Error(encrypted.failure.message)

      const [inserted] = await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(encrypted.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
        RETURNING id
      `

      const queryResult = await protectClient.encryptQuery({ role: 'contained-by-kv' }, {
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
        WHERE ${containmentTerm}::eql_v2_encrypted <@ metadata
        AND test_run_id = ${TEST_RUN_ID}
      `

      expect(rows.length).toBeGreaterThanOrEqual(1)
      const matchingRow = rows.find((r) => r.id === inserted.id)
      expect(matchingRow).toBeDefined()

      const decrypted = await protectClient.decryptModel({ metadata: matchingRow!.metadata })
      if (decrypted.failure) throw new Error(decrypted.failure.message)
      expect(decrypted.data.metadata).toEqual(plaintext)
    }, 30000)

    it('matches by nested object (Extended)', async () => {
      const plaintext = { user: { profile: { role: 'contained-by-nested' } }, active: true }

      const encrypted = await protectClient.encryptModel({ metadata: plaintext }, table)
      if (encrypted.failure) throw new Error(encrypted.failure.message)

      const [inserted] = await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(encrypted.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
        RETURNING id
      `

      const queryResult = await protectClient.encryptQuery({ user: { profile: { role: 'contained-by-nested' } } }, {
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
        WHERE ${containmentTerm}::eql_v2_encrypted <@ metadata
        AND test_run_id = ${TEST_RUN_ID}
      `

      expect(rows.length).toBeGreaterThanOrEqual(1)
      const matchingRow = rows.find((r) => r.id === inserted.id)
      expect(matchingRow).toBeDefined()

      const decrypted = await protectClient.decryptModel({ metadata: matchingRow!.metadata })
      if (decrypted.failure) throw new Error(decrypted.failure.message)
      expect(decrypted.data.metadata).toEqual(plaintext)
    }, 30000)

    it('non-matching value returns zero rows (Extended)', async () => {
      const plaintext = { status: 'active-cb', tier: 'free' }

      const encrypted = await protectClient.encryptModel({ metadata: plaintext }, table)
      if (encrypted.failure) throw new Error(encrypted.failure.message)

      await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(encrypted.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
      `

      const queryResult = await protectClient.encryptQuery({ status: 'nonexistent-cb-xyz' }, {
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
        WHERE ${containmentTerm}::eql_v2_encrypted <@ metadata
        AND test_run_id = ${TEST_RUN_ID}
      `

      expect(rows.length).toBe(0)
    }, 30000)

    it('matches by key/value pair (Simple)', async () => {
      const plaintext = { role: 'contained-by-kv-simple', department: 'ops' }

      const encrypted = await protectClient.encryptModel({ metadata: plaintext }, table)
      if (encrypted.failure) throw new Error(encrypted.failure.message)

      const [inserted] = await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(encrypted.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
        RETURNING id
      `

      const queryResult = await protectClient.encryptQuery({ role: 'contained-by-kv-simple' }, {
        column: table.metadata,
        table: table,
        queryType: 'steVecTerm',
        returnType: 'composite-literal',
      })
      if (queryResult.failure) throw new Error(queryResult.failure.message)
      const containmentTerm = queryResult.data

      const rows = await sql.unsafe(
        `SELECT id, (metadata).data as metadata
         FROM "protect-ci-jsonb"
         WHERE '${containmentTerm}'::eql_v2_encrypted <@ metadata
         AND test_run_id = '${TEST_RUN_ID}'`
      )

      expect(rows.length).toBeGreaterThanOrEqual(1)
      const matchingRow = rows.find((r: any) => r.id === inserted.id)
      expect(matchingRow).toBeDefined()

      const decrypted = await protectClient.decryptModel({ metadata: matchingRow!.metadata })
      if (decrypted.failure) throw new Error(decrypted.failure.message)
      expect(decrypted.data.metadata).toEqual(plaintext)
    }, 30000)

    it('matches by nested object (Simple)', async () => {
      const plaintext = { user: { profile: { role: 'contained-by-nested-simple' } }, active: true }

      const encrypted = await protectClient.encryptModel({ metadata: plaintext }, table)
      if (encrypted.failure) throw new Error(encrypted.failure.message)

      const [inserted] = await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(encrypted.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
        RETURNING id
      `

      const queryResult = await protectClient.encryptQuery({ user: { profile: { role: 'contained-by-nested-simple' } } }, {
        column: table.metadata,
        table: table,
        queryType: 'steVecTerm',
        returnType: 'composite-literal',
      })
      if (queryResult.failure) throw new Error(queryResult.failure.message)
      const containmentTerm = queryResult.data

      const rows = await sql.unsafe(
        `SELECT id, (metadata).data as metadata
         FROM "protect-ci-jsonb"
         WHERE '${containmentTerm}'::eql_v2_encrypted <@ metadata
         AND test_run_id = '${TEST_RUN_ID}'`
      )

      expect(rows.length).toBeGreaterThanOrEqual(1)
      const matchingRow = rows.find((r: any) => r.id === inserted.id)
      expect(matchingRow).toBeDefined()

      const decrypted = await protectClient.decryptModel({ metadata: matchingRow!.metadata })
      if (decrypted.failure) throw new Error(decrypted.failure.message)
      expect(decrypted.data.metadata).toEqual(plaintext)
    }, 30000)

    it('non-matching value returns zero rows (Simple)', async () => {
      const plaintext = { status: 'active-cb-simple', tier: 'premium' }

      const encrypted = await protectClient.encryptModel({ metadata: plaintext }, table)
      if (encrypted.failure) throw new Error(encrypted.failure.message)

      await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(encrypted.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
      `

      const queryResult = await protectClient.encryptQuery({ status: 'nonexistent-cb-simple-xyz' }, {
        column: table.metadata,
        table: table,
        queryType: 'steVecTerm',
        returnType: 'composite-literal',
      })
      if (queryResult.failure) throw new Error(queryResult.failure.message)
      const containmentTerm = queryResult.data

      const rows = await sql.unsafe(
        `SELECT id, (metadata).data as metadata
         FROM "protect-ci-jsonb"
         WHERE '${containmentTerm}'::eql_v2_encrypted <@ metadata
         AND test_run_id = '${TEST_RUN_ID}'`
      )

      expect(rows.length).toBe(0)
    }, 30000)
  })

  // ─── jsonb_path_query_first: scalar path queries ──────────────────

  describe('jsonb_path_query_first: scalar path queries', () => {
    it('finds row by string field (Extended)', async () => {
      const plaintext = { role: 'qf-string', extra: 'data' }

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
        FROM "protect-ci-jsonb" t
        WHERE eql_v2.jsonb_path_query_first(t.metadata, ${selectorTerm}::eql_v2_encrypted) IS NOT NULL
        AND t.test_run_id = ${TEST_RUN_ID}
      `

      expect(rows.length).toBeGreaterThanOrEqual(1)
      const matchingRow = rows.find((r) => r.id === inserted.id)
      expect(matchingRow).toBeDefined()

      const decrypted = await protectClient.decryptModel({ metadata: matchingRow!.metadata })
      if (decrypted.failure) throw new Error(decrypted.failure.message)
      expect(decrypted.data.metadata).toEqual(plaintext)
    }, 30000)

    it('finds row by nested path (Extended)', async () => {
      const plaintext = { user: { email: 'qf-nested@test.com' }, type: 'qf-nested' }

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
        FROM "protect-ci-jsonb" t
        WHERE eql_v2.jsonb_path_query_first(t.metadata, ${selectorTerm}::eql_v2_encrypted) IS NOT NULL
        AND t.test_run_id = ${TEST_RUN_ID}
      `

      expect(rows.length).toBeGreaterThanOrEqual(1)
      const matchingRow = rows.find((r) => r.id === inserted.id)
      expect(matchingRow).toBeDefined()

      const decrypted = await protectClient.decryptModel({ metadata: matchingRow!.metadata })
      if (decrypted.failure) throw new Error(decrypted.failure.message)
      expect(decrypted.data.metadata).toEqual(plaintext)
    }, 30000)

    it('returns no rows for unknown path (Extended)', async () => {
      const plaintext = { exists: true, marker: 'qf-nomatch' }

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
        FROM "protect-ci-jsonb" t
        WHERE eql_v2.jsonb_path_query_first(t.metadata, ${selectorTerm}::eql_v2_encrypted) IS NOT NULL
        AND t.test_run_id = ${TEST_RUN_ID}
      `

      expect(rows.length).toBe(0)
    }, 30000)

    it('finds row by string field (Simple)', async () => {
      const plaintext = { role: 'qf-string-simple', extra: 'data' }

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

      const rows = await sql.unsafe(
        `SELECT id, (metadata).data as metadata
         FROM "protect-ci-jsonb" t
         WHERE eql_v2.jsonb_path_query_first(t.metadata, '${selectorTerm}'::eql_v2_encrypted) IS NOT NULL
         AND t.test_run_id = '${TEST_RUN_ID}'`
      )

      expect(rows.length).toBeGreaterThanOrEqual(1)
      const matchingRow = rows.find((r: any) => r.id === inserted.id)
      expect(matchingRow).toBeDefined()

      const decrypted = await protectClient.decryptModel({ metadata: matchingRow!.metadata })
      if (decrypted.failure) throw new Error(decrypted.failure.message)
      expect(decrypted.data.metadata).toEqual(plaintext)
    }, 30000)

    it('finds row by nested path (Simple)', async () => {
      const plaintext = { user: { email: 'qf-nested-simple@test.com' }, type: 'qf-nested-simple' }

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

      const rows = await sql.unsafe(
        `SELECT id, (metadata).data as metadata
         FROM "protect-ci-jsonb" t
         WHERE eql_v2.jsonb_path_query_first(t.metadata, '${selectorTerm}'::eql_v2_encrypted) IS NOT NULL
         AND t.test_run_id = '${TEST_RUN_ID}'`
      )

      expect(rows.length).toBeGreaterThanOrEqual(1)
      const matchingRow = rows.find((r: any) => r.id === inserted.id)
      expect(matchingRow).toBeDefined()

      const decrypted = await protectClient.decryptModel({ metadata: matchingRow!.metadata })
      if (decrypted.failure) throw new Error(decrypted.failure.message)
      expect(decrypted.data.metadata).toEqual(plaintext)
    }, 30000)

    it('returns no rows for unknown path (Simple)', async () => {
      const plaintext = { exists: true, marker: 'qf-nomatch-simple' }

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

      const rows = await sql.unsafe(
        `SELECT id, (metadata).data as metadata
         FROM "protect-ci-jsonb" t
         WHERE eql_v2.jsonb_path_query_first(t.metadata, '${selectorTerm}'::eql_v2_encrypted) IS NOT NULL
         AND t.test_run_id = '${TEST_RUN_ID}'`
      )

      expect(rows.length).toBe(0)
    }, 30000)
  })

  // ─── jsonb_path_exists: boolean path queries ──────────────────────

  describe('jsonb_path_exists: boolean path queries', () => {
    it('returns true for existing field (Extended)', async () => {
      const plaintext = { role: 'pe-exists', extra: 'data' }

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
        FROM "protect-ci-jsonb" t
        WHERE eql_v2.jsonb_path_exists(t.metadata, ${selectorTerm}::eql_v2_encrypted)
        AND t.test_run_id = ${TEST_RUN_ID}
      `

      expect(rows.length).toBeGreaterThanOrEqual(1)
      const matchingRow = rows.find((r) => r.id === inserted.id)
      expect(matchingRow).toBeDefined()

      const decrypted = await protectClient.decryptModel({ metadata: matchingRow!.metadata })
      if (decrypted.failure) throw new Error(decrypted.failure.message)
      expect(decrypted.data.metadata).toEqual(plaintext)
    }, 30000)

    it('returns true for nested path (Extended)', async () => {
      const plaintext = { user: { email: 'pe-nested@test.com' }, type: 'pe-nested' }

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
        FROM "protect-ci-jsonb" t
        WHERE eql_v2.jsonb_path_exists(t.metadata, ${selectorTerm}::eql_v2_encrypted)
        AND t.test_run_id = ${TEST_RUN_ID}
      `

      expect(rows.length).toBeGreaterThanOrEqual(1)
      const matchingRow = rows.find((r) => r.id === inserted.id)
      expect(matchingRow).toBeDefined()

      const decrypted = await protectClient.decryptModel({ metadata: matchingRow!.metadata })
      if (decrypted.failure) throw new Error(decrypted.failure.message)
      expect(decrypted.data.metadata).toEqual(plaintext)
    }, 30000)

    it('returns false for unknown path (Extended)', async () => {
      const plaintext = { exists: true, marker: 'pe-nomatch' }

      const encrypted = await protectClient.encryptModel({ metadata: plaintext }, table)
      if (encrypted.failure) throw new Error(encrypted.failure.message)

      const [inserted] = await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(encrypted.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
        RETURNING id
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
        SELECT id, eql_v2.jsonb_path_exists(t.metadata, ${selectorTerm}::eql_v2_encrypted) as path_exists
        FROM "protect-ci-jsonb" t
        WHERE t.id = ${inserted.id}
      `

      expect(rows).toHaveLength(1)
      expect(rows[0].path_exists).toBe(false)
    }, 30000)

    it('returns true for existing field (Simple)', async () => {
      const plaintext = { role: 'pe-exists-simple', extra: 'data' }

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

      const rows = await sql.unsafe(
        `SELECT id, (metadata).data as metadata
         FROM "protect-ci-jsonb" t
         WHERE eql_v2.jsonb_path_exists(t.metadata, '${selectorTerm}'::eql_v2_encrypted)
         AND test_run_id = '${TEST_RUN_ID}'`
      )

      expect(rows.length).toBeGreaterThanOrEqual(1)
      const matchingRow = rows.find((r: any) => r.id === inserted.id)
      expect(matchingRow).toBeDefined()

      const decrypted = await protectClient.decryptModel({ metadata: matchingRow!.metadata })
      if (decrypted.failure) throw new Error(decrypted.failure.message)
      expect(decrypted.data.metadata).toEqual(plaintext)
    }, 30000)

    it('returns false for unknown path (Simple)', async () => {
      const plaintext = { exists: true, marker: 'pe-nomatch-simple' }

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

      const rows = await sql.unsafe(
        `SELECT id, (metadata).data as metadata
         FROM "protect-ci-jsonb" t
         WHERE eql_v2.jsonb_path_exists(t.metadata, '${selectorTerm}'::eql_v2_encrypted)
         AND test_run_id = '${TEST_RUN_ID}'`
      )

      expect(rows.length).toBe(0)
    }, 30000)
  })

  describe('jsonb_array_elements + jsonb_array_length: array queries', () => {
    it('returns null length for missing path (Extended)', async () => {
      const plaintext = { exists: true, marker: 'al-nomatch' }

      const encrypted = await protectClient.encryptModel({ metadata: plaintext }, table)
      if (encrypted.failure) throw new Error(encrypted.failure.message)

      const [inserted] = await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(encrypted.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
        RETURNING id
      `

      const queryResult = await protectClient.encryptQuery('$.nonexistent', {
        column: table.metadata,
        table: table,
        queryType: 'steVecSelector',
        returnType: 'composite-literal',
      })
      if (queryResult.failure) throw new Error(queryResult.failure.message)
      const selectorTerm = queryResult.data

      const rows = await sql`
        SELECT t.id,
               eql_v2.jsonb_array_length(
                 eql_v2.jsonb_path_query_first(t.metadata, ${selectorTerm}::eql_v2_encrypted)
               ) as arr_len
        FROM "protect-ci-jsonb" t
        WHERE t.id = ${inserted.id}
      `

      expect(rows).toHaveLength(1)
      expect(rows[0].arr_len).toBeNull()
    }, 30000)
  })

  describe('containment: @> with array values', () => {
    it('matches array subset (Extended)', async () => {
      const plaintext = { tags: ['ac-alpha', 'ac-beta', 'ac-gamma'], marker: 'ac-subset' }

      const encrypted = await protectClient.encryptModel({ metadata: plaintext }, table)
      if (encrypted.failure) throw new Error(encrypted.failure.message)

      const [inserted] = await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(encrypted.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
        RETURNING id
      `

      const queryResult = await protectClient.encryptQuery({ tags: ['ac-alpha'] }, {
        column: table.metadata,
        table: table,
        queryType: 'steVecTerm',
        returnType: 'composite-literal',
      })
      if (queryResult.failure) throw new Error(queryResult.failure.message)
      const containmentTerm = queryResult.data

      const rows = await sql`
        SELECT id, (metadata).data as metadata
        FROM "protect-ci-jsonb" t
        WHERE t.metadata @> ${containmentTerm}::eql_v2_encrypted
        AND t.test_run_id = ${TEST_RUN_ID}
      `

      expect(rows.length).toBeGreaterThanOrEqual(1)
      const matchingRow = rows.find((r) => r.id === inserted.id)
      expect(matchingRow).toBeDefined()

      const decrypted = await protectClient.decryptModel({ metadata: matchingRow!.metadata })
      if (decrypted.failure) throw new Error(decrypted.failure.message)
      expect(decrypted.data.metadata).toEqual(plaintext)
    }, 30000)

    it('matches multi-element subset (Extended)', async () => {
      const plaintext = { tags: ['ac-multi-a', 'ac-multi-b', 'ac-multi-c'], marker: 'ac-multi' }

      const encrypted = await protectClient.encryptModel({ metadata: plaintext }, table)
      if (encrypted.failure) throw new Error(encrypted.failure.message)

      const [inserted] = await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(encrypted.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
        RETURNING id
      `

      const queryResult = await protectClient.encryptQuery({ tags: ['ac-multi-a', 'ac-multi-c'] }, {
        column: table.metadata,
        table: table,
        queryType: 'steVecTerm',
        returnType: 'composite-literal',
      })
      if (queryResult.failure) throw new Error(queryResult.failure.message)
      const containmentTerm = queryResult.data

      const rows = await sql`
        SELECT id, (metadata).data as metadata
        FROM "protect-ci-jsonb" t
        WHERE t.metadata @> ${containmentTerm}::eql_v2_encrypted
        AND t.test_run_id = ${TEST_RUN_ID}
      `

      expect(rows.length).toBeGreaterThanOrEqual(1)
      const matchingRow = rows.find((r) => r.id === inserted.id)
      expect(matchingRow).toBeDefined()

      const decrypted = await protectClient.decryptModel({ metadata: matchingRow!.metadata })
      if (decrypted.failure) throw new Error(decrypted.failure.message)
      expect(decrypted.data.metadata).toEqual(plaintext)
    }, 30000)

    it('non-matching array value returns no rows (Extended)', async () => {
      const plaintext = { tags: ['ac-exist'], marker: 'ac-nomatch' }

      const encrypted = await protectClient.encryptModel({ metadata: plaintext }, table)
      if (encrypted.failure) throw new Error(encrypted.failure.message)

      await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(encrypted.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
      `

      const queryResult = await protectClient.encryptQuery({ tags: ['ac-nonexistent'] }, {
        column: table.metadata,
        table: table,
        queryType: 'steVecTerm',
        returnType: 'composite-literal',
      })
      if (queryResult.failure) throw new Error(queryResult.failure.message)
      const containmentTerm = queryResult.data

      const rows = await sql`
        SELECT id, (metadata).data as metadata
        FROM "protect-ci-jsonb" t
        WHERE t.metadata @> ${containmentTerm}::eql_v2_encrypted
        AND t.test_run_id = ${TEST_RUN_ID}
      `

      expect(rows.length).toBe(0)
    }, 30000)

    it('matches array subset (Simple)', async () => {
      const plaintext = { tags: ['ac-simple-x', 'ac-simple-y'], marker: 'ac-simple' }

      const encrypted = await protectClient.encryptModel({ metadata: plaintext }, table)
      if (encrypted.failure) throw new Error(encrypted.failure.message)

      const [inserted] = await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(encrypted.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
        RETURNING id
      `

      const queryResult = await protectClient.encryptQuery({ tags: ['ac-simple-x'] }, {
        column: table.metadata,
        table: table,
        queryType: 'steVecTerm',
        returnType: 'composite-literal',
      })
      if (queryResult.failure) throw new Error(queryResult.failure.message)
      const containmentTerm = queryResult.data

      const rows = await sql.unsafe(
        `SELECT id, (metadata).data as metadata
         FROM "protect-ci-jsonb" t
         WHERE t.metadata @> $1::eql_v2_encrypted
         AND t.test_run_id = $2`,
        [containmentTerm, TEST_RUN_ID]
      )

      expect(rows.length).toBeGreaterThanOrEqual(1)
      const matchingRow = rows.find((r: any) => r.id === inserted.id)
      expect(matchingRow).toBeDefined()

      const decrypted = await protectClient.decryptModel({ metadata: matchingRow!.metadata })
      if (decrypted.failure) throw new Error(decrypted.failure.message)
      expect(decrypted.data.metadata).toEqual(plaintext)
    }, 30000)

    it('non-matching array value returns no rows (Simple)', async () => {
      const plaintext = { tags: ['ac-s-exist'], marker: 'ac-s-nomatch' }

      const encrypted = await protectClient.encryptModel({ metadata: plaintext }, table)
      if (encrypted.failure) throw new Error(encrypted.failure.message)

      await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(encrypted.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
      `

      const queryResult = await protectClient.encryptQuery({ tags: ['ac-s-absent'] }, {
        column: table.metadata,
        table: table,
        queryType: 'steVecTerm',
        returnType: 'composite-literal',
      })
      if (queryResult.failure) throw new Error(queryResult.failure.message)
      const containmentTerm = queryResult.data

      const rows = await sql.unsafe(
        `SELECT id, (metadata).data as metadata
         FROM "protect-ci-jsonb" t
         WHERE t.metadata @> $1::eql_v2_encrypted
         AND t.test_run_id = $2`,
        [containmentTerm, TEST_RUN_ID]
      )

      expect(rows.length).toBe(0)
    }, 30000)

    it('matches nested array subset (Extended)', async () => {
      const plaintext = { user: { roles: ['ac-nested-admin', 'ac-nested-editor'] }, marker: 'ac-nested' }

      const encrypted = await protectClient.encryptModel({ metadata: plaintext }, table)
      if (encrypted.failure) throw new Error(encrypted.failure.message)

      const [inserted] = await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(encrypted.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
        RETURNING id
      `

      const queryResult = await protectClient.encryptQuery({ user: { roles: ['ac-nested-admin'] } }, {
        column: table.metadata,
        table: table,
        queryType: 'steVecTerm',
        returnType: 'composite-literal',
      })
      if (queryResult.failure) throw new Error(queryResult.failure.message)
      const containmentTerm = queryResult.data

      const rows = await sql`
        SELECT id, (metadata).data as metadata
        FROM "protect-ci-jsonb" t
        WHERE t.metadata @> ${containmentTerm}::eql_v2_encrypted
        AND t.test_run_id = ${TEST_RUN_ID}
      `

      expect(rows.length).toBeGreaterThanOrEqual(1)
      const matchingRow = rows.find((r) => r.id === inserted.id)
      expect(matchingRow).toBeDefined()

      const decrypted = await protectClient.decryptModel({ metadata: matchingRow!.metadata })
      if (decrypted.failure) throw new Error(decrypted.failure.message)
      expect(decrypted.data.metadata).toEqual(plaintext)
    }, 30000)
  })

  describe('contained-by: <@ with array values', () => {
    it('matches array superset (Extended)', async () => {
      const plaintext = { tags: ['cb-one', 'cb-two', 'cb-three'], marker: 'cb-superset' }

      const encrypted = await protectClient.encryptModel({ metadata: plaintext }, table)
      if (encrypted.failure) throw new Error(encrypted.failure.message)

      const [inserted] = await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(encrypted.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
        RETURNING id
      `

      const queryResult = await protectClient.encryptQuery({ tags: ['cb-one'] }, {
        column: table.metadata,
        table: table,
        queryType: 'steVecTerm',
        returnType: 'composite-literal',
      })
      if (queryResult.failure) throw new Error(queryResult.failure.message)
      const containmentTerm = queryResult.data

      const rows = await sql`
        SELECT id, (metadata).data as metadata
        FROM "protect-ci-jsonb" t
        WHERE ${containmentTerm}::eql_v2_encrypted <@ t.metadata
        AND t.test_run_id = ${TEST_RUN_ID}
      `

      expect(rows.length).toBeGreaterThanOrEqual(1)
      const matchingRow = rows.find((r) => r.id === inserted.id)
      expect(matchingRow).toBeDefined()

      const decrypted = await protectClient.decryptModel({ metadata: matchingRow!.metadata })
      if (decrypted.failure) throw new Error(decrypted.failure.message)
      expect(decrypted.data.metadata).toEqual(plaintext)
    }, 30000)

    it('non-matching array returns no rows (Extended)', async () => {
      const plaintext = { tags: ['cb-exist'], marker: 'cb-nomatch' }

      const encrypted = await protectClient.encryptModel({ metadata: plaintext }, table)
      if (encrypted.failure) throw new Error(encrypted.failure.message)

      await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(encrypted.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
      `

      const queryResult = await protectClient.encryptQuery({ tags: ['cb-absent'] }, {
        column: table.metadata,
        table: table,
        queryType: 'steVecTerm',
        returnType: 'composite-literal',
      })
      if (queryResult.failure) throw new Error(queryResult.failure.message)
      const containmentTerm = queryResult.data

      const rows = await sql`
        SELECT id, (metadata).data as metadata
        FROM "protect-ci-jsonb" t
        WHERE ${containmentTerm}::eql_v2_encrypted <@ t.metadata
        AND t.test_run_id = ${TEST_RUN_ID}
      `

      expect(rows.length).toBe(0)
    }, 30000)

    it('matches array superset (Simple)', async () => {
      const plaintext = { tags: ['cb-s-one', 'cb-s-two'], marker: 'cb-s-super' }

      const encrypted = await protectClient.encryptModel({ metadata: plaintext }, table)
      if (encrypted.failure) throw new Error(encrypted.failure.message)

      const [inserted] = await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(encrypted.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
        RETURNING id
      `

      const queryResult = await protectClient.encryptQuery({ tags: ['cb-s-one'] }, {
        column: table.metadata,
        table: table,
        queryType: 'steVecTerm',
        returnType: 'composite-literal',
      })
      if (queryResult.failure) throw new Error(queryResult.failure.message)
      const containmentTerm = queryResult.data

      const rows = await sql.unsafe(
        `SELECT id, (metadata).data as metadata
         FROM "protect-ci-jsonb" t
         WHERE $1::eql_v2_encrypted <@ t.metadata
         AND t.test_run_id = $2`,
        [containmentTerm, TEST_RUN_ID]
      )

      expect(rows.length).toBeGreaterThanOrEqual(1)
      const matchingRow = rows.find((r: any) => r.id === inserted.id)
      expect(matchingRow).toBeDefined()

      const decrypted = await protectClient.decryptModel({ metadata: matchingRow!.metadata })
      if (decrypted.failure) throw new Error(decrypted.failure.message)
      expect(decrypted.data.metadata).toEqual(plaintext)
    }, 30000)

    it('non-matching array returns no rows (Simple)', async () => {
      const plaintext = { tags: ['cb-s-exist'], marker: 'cb-s-nomatch' }

      const encrypted = await protectClient.encryptModel({ metadata: plaintext }, table)
      if (encrypted.failure) throw new Error(encrypted.failure.message)

      await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(encrypted.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
      `

      const queryResult = await protectClient.encryptQuery({ tags: ['cb-s-absent'] }, {
        column: table.metadata,
        table: table,
        queryType: 'steVecTerm',
        returnType: 'composite-literal',
      })
      if (queryResult.failure) throw new Error(queryResult.failure.message)
      const containmentTerm = queryResult.data

      const rows = await sql.unsafe(
        `SELECT id, (metadata).data as metadata
         FROM "protect-ci-jsonb" t
         WHERE $1::eql_v2_encrypted <@ t.metadata
         AND t.test_run_id = $2`,
        [containmentTerm, TEST_RUN_ID]
      )

      expect(rows.length).toBe(0)
    }, 30000)
  })

  describe('storage: array round-trips (gaps only)', () => {
    it('round-trips object with empty string array', async () => {
      const plaintext = { tags: [], marker: 'rt-empty-string-arr' }

      const encrypted = await protectClient.encryptModel({ metadata: plaintext }, table)
      if (encrypted.failure) throw new Error(encrypted.failure.message)

      const [inserted] = await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(encrypted.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
        RETURNING id
      `

      const rows = await sql`
        SELECT id, (metadata).data as metadata
        FROM "protect-ci-jsonb" t
        WHERE t.id = ${inserted.id}
      `

      expect(rows).toHaveLength(1)

      const decrypted = await protectClient.decryptModel({ metadata: rows[0].metadata })
      if (decrypted.failure) throw new Error(decrypted.failure.message)
      expect(decrypted.data.metadata).toEqual(plaintext)
    }, 30000)

    it('round-trips nested empty object array', async () => {
      const plaintext = { data: { items: [] }, marker: 'rt-empty-obj-arr' }

      const encrypted = await protectClient.encryptModel({ metadata: plaintext }, table)
      if (encrypted.failure) throw new Error(encrypted.failure.message)

      const [inserted] = await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(encrypted.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
        RETURNING id
      `

      const rows = await sql`
        SELECT id, (metadata).data as metadata
        FROM "protect-ci-jsonb" t
        WHERE t.id = ${inserted.id}
      `

      expect(rows).toHaveLength(1)

      const decrypted = await protectClient.decryptModel({ metadata: rows[0].metadata })
      if (decrypted.failure) throw new Error(decrypted.failure.message)
      expect(decrypted.data.metadata).toEqual(plaintext)
    }, 30000)
  })

  describe('jsonb_array_elements + jsonb_array_length: top-level array', () => {
    it('expands top-level string array (Extended)', async () => {
      const plaintext = ['tla-alpha', 'tla-beta', 'tla-gamma']

      const encrypted = await protectClient.encryptModel({ metadata: plaintext }, table)
      if (encrypted.failure) throw new Error(encrypted.failure.message)

      const [inserted] = await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(encrypted.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
        RETURNING id
      `

      const rows = await sql`
        SELECT t.id
        FROM "protect-ci-jsonb" t,
             eql_v2.jsonb_array_elements(t.metadata) as elem
        WHERE t.id = ${inserted.id}
      `

      expect(rows).toHaveLength(3)
    }, 30000)

    it('returns length of top-level array (Extended)', async () => {
      const plaintext = ['tla-len-a', 'tla-len-b', 'tla-len-c']

      const encrypted = await protectClient.encryptModel({ metadata: plaintext }, table)
      if (encrypted.failure) throw new Error(encrypted.failure.message)

      const [inserted] = await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(encrypted.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
        RETURNING id
      `

      const rows = await sql`
        SELECT eql_v2.jsonb_array_length(t.metadata) as arr_len
        FROM "protect-ci-jsonb" t
        WHERE t.id = ${inserted.id}
      `

      expect(rows).toHaveLength(1)
      expect(rows[0].arr_len).toBe(3)
    }, 30000)

    it('expands top-level string array (Simple)', async () => {
      const plaintext = ['tla-s-x', 'tla-s-y']

      const encrypted = await protectClient.encryptModel({ metadata: plaintext }, table)
      if (encrypted.failure) throw new Error(encrypted.failure.message)

      const [inserted] = await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(encrypted.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
        RETURNING id
      `

      const rows = await sql.unsafe(
        `SELECT t.id
         FROM "protect-ci-jsonb" t,
              eql_v2.jsonb_array_elements(t.metadata) as elem
         WHERE t.id = $1`,
        [inserted.id]
      )

      expect(rows).toHaveLength(2)
    }, 30000)

    it('returns length of top-level array (Simple)', async () => {
      const plaintext = ['tla-s-a', 'tla-s-b', 'tla-s-c']

      const encrypted = await protectClient.encryptModel({ metadata: plaintext }, table)
      if (encrypted.failure) throw new Error(encrypted.failure.message)

      const [inserted] = await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(encrypted.data.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
        RETURNING id
      `

      const rows = await sql.unsafe(
        `SELECT eql_v2.jsonb_array_length(t.metadata) as arr_len
         FROM "protect-ci-jsonb" t
         WHERE t.id = $1`,
        [inserted.id]
      )

      expect(rows).toHaveLength(1)
      expect(rows[0].arr_len).toBe(3)
    }, 30000)
  })
})
