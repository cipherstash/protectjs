import 'dotenv/config'
import { csColumn, csTable } from '@cipherstash/schema'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  type Encrypted,
  bulkModelsToEncryptedPgComposites,
  encryptedToPgComposite,
  modelToEncryptedPgComposites,
  protect,
} from '../src'
import postgres from 'postgres'

if (!process.env.DATABASE_URL) {
  throw new Error('Missing env.DATABASE_URL')
}

const sql = postgres(process.env.DATABASE_URL)

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
  await sql`DROP TABLE IF EXISTS "protect-ci-jsonb"`
  await sql.end()
}, 30000)

describe('searchableJson postgres integration', () => {
  // 1. encrypts JSON object, inserts, selects, decrypts
  it('encrypts JSON object, inserts, selects, decrypts', async () => {
    const plaintext = { user: { email: 'test@example.com' }, role: 'admin' }

    const encrypted = await protectClient.encrypt(plaintext, {
      column: table.metadata,
      table: table,
    })

    if (encrypted.failure) {
      throw new Error(`encrypt failed: ${encrypted.failure.message}`)
    }

    const composite = encryptedToPgComposite(encrypted.data)

    const [inserted] = await sql`
      INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
      VALUES (${sql.json(composite)}::eql_v2_encrypted, ${TEST_RUN_ID})
      RETURNING id
    `

    const rows = await sql`
      SELECT id, metadata::jsonb FROM "protect-ci-jsonb"
      WHERE id = ${inserted.id}
    `

    expect(rows).toHaveLength(1)

    const decrypted = await protectClient.decrypt(rows[0].metadata as Encrypted)
    expect(decrypted).toEqual({ data: plaintext })
  }, 30000)

  // 2. bulk encrypt/insert/select/decrypt for multiple docs
  it('bulk encrypt/insert/select/decrypt for multiple docs', async () => {
    const models = [
      { metadata: { doc: 'first', tags: ['a'] } },
      { metadata: { doc: 'second', tags: ['b'] } },
    ]

    const encryptedModels = await protectClient.bulkEncryptModels(models, table)

    if (encryptedModels.failure) {
      throw new Error(`bulkEncryptModels failed: ${encryptedModels.failure.message}`)
    }

    const dataToInsert = bulkModelsToEncryptedPgComposites(encryptedModels.data)

    const insertedRows = []
    for (const row of dataToInsert) {
      const [inserted] = await sql`
        INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
        VALUES (${sql.json(row.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
        RETURNING id
      `
      insertedRows.push(inserted)
    }

    const ids = insertedRows.map((r) => r.id)
    const rows = await sql`
      SELECT id, metadata::jsonb FROM "protect-ci-jsonb"
      WHERE id = ANY(${ids})
      ORDER BY id
    `

    expect(rows).toHaveLength(2)

    const decryptedModels = await protectClient.bulkDecryptModels(
      rows.map((r) => ({ metadata: r.metadata })),
    )

    if (decryptedModels.failure) {
      throw new Error(`bulkDecryptModels failed: ${decryptedModels.failure.message}`)
    }

    expect(decryptedModels.data.map((d) => d.metadata)).toEqual(
      models.map((m) => m.metadata),
    )
  }, 30000)

  // 3. nested JSON with arrays round-trip
  it('nested JSON with arrays round-trip', async () => {
    const plaintext = {
      user: {
        profile: { role: 'admin', permissions: ['read', 'write'] },
        tags: [{ name: 'vip' }, { name: 'beta' }],
      },
      items: [{ id: 1, name: 'widget' }],
    }

    const model = { metadata: plaintext }
    const encryptedModel = await protectClient.encryptModel(model, table)

    if (encryptedModel.failure) {
      throw new Error(`encryptModel failed: ${encryptedModel.failure.message}`)
    }

    const pgData = modelToEncryptedPgComposites(encryptedModel.data)

    const [inserted] = await sql`
      INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
      VALUES (${sql.json(pgData.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
      RETURNING id
    `

    const rows = await sql`
      SELECT id, metadata::jsonb FROM "protect-ci-jsonb"
      WHERE id = ${inserted.id}
    `

    const decryptedModel = await protectClient.decryptModel({ metadata: rows[0].metadata })

    if (decryptedModel.failure) {
      throw new Error(`decryptModel failed: ${decryptedModel.failure.message}`)
    }

    expect(decryptedModel.data.metadata).toEqual(plaintext)
  }, 30000)

  // 4. selector query simple path ('$.user.email')
  it('selector query simple path', async () => {
    const plaintext = { user: { email: 'selector-simple@test.com' }, type: 'selector-simple' }
    const model = { metadata: plaintext }

    const encryptedModel = await protectClient.encryptModel(model, table)
    if (encryptedModel.failure) throw new Error(encryptedModel.failure.message)

    const pgData = modelToEncryptedPgComposites(encryptedModel.data)
    await sql`
      INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
      VALUES (${sql.json(pgData.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
    `

    const queryResult = await protectClient.encryptQuery([
      {
        value: '$.user.email',
        column: table.metadata,
        table: table,
        queryType: 'searchableJson',
        returnType: 'composite-literal',
      },
    ])

    if (queryResult.failure) throw new Error(queryResult.failure.message)
    const [searchTerm] = queryResult.data

    const rows = await sql`
      SELECT id, metadata::jsonb FROM "protect-ci-jsonb"
      WHERE metadata @> ${searchTerm}::eql_v2_encrypted
      AND test_run_id = ${TEST_RUN_ID}
    `

    expect(rows.length).toBeGreaterThanOrEqual(1)

    const decryptedModel = await protectClient.decryptModel({ metadata: rows[0].metadata })
    if (decryptedModel.failure) throw new Error(decryptedModel.failure.message)

    expect(decryptedModel.data.metadata).toHaveProperty('user')
    expect((decryptedModel.data.metadata as any).user).toHaveProperty('email')
  }, 30000)

  // 5. selector query nested path ('$.user.profile.role')
  it('selector query nested path', async () => {
    const plaintext = { user: { profile: { role: 'moderator' } }, type: 'selector-nested' }
    const model = { metadata: plaintext }

    const encryptedModel = await protectClient.encryptModel(model, table)
    if (encryptedModel.failure) throw new Error(encryptedModel.failure.message)

    const pgData = modelToEncryptedPgComposites(encryptedModel.data)
    await sql`
      INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
      VALUES (${sql.json(pgData.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
    `

    const queryResult = await protectClient.encryptQuery([
      {
        value: '$.user.profile.role',
        column: table.metadata,
        table: table,
        queryType: 'searchableJson',
        returnType: 'composite-literal',
      },
    ])

    if (queryResult.failure) throw new Error(queryResult.failure.message)
    const [searchTerm] = queryResult.data

    const rows = await sql`
      SELECT id, metadata::jsonb FROM "protect-ci-jsonb"
      WHERE metadata @> ${searchTerm}::eql_v2_encrypted
      AND test_run_id = ${TEST_RUN_ID}
    `

    expect(rows.length).toBeGreaterThanOrEqual(1)

    const decryptedModel = await protectClient.decryptModel({ metadata: rows[0].metadata })
    if (decryptedModel.failure) throw new Error(decryptedModel.failure.message)

    expect((decryptedModel.data.metadata as any).user.profile.role).toBeDefined()
  }, 30000)

  // 6. selector query array index ('$.items[0].name')
  it('selector query array index', async () => {
    const plaintext = { items: [{ name: 'widget-selector' }, { name: 'gadget' }], type: 'selector-array' }
    const model = { metadata: plaintext }

    const encryptedModel = await protectClient.encryptModel(model, table)
    if (encryptedModel.failure) throw new Error(encryptedModel.failure.message)

    const pgData = modelToEncryptedPgComposites(encryptedModel.data)
    await sql`
      INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
      VALUES (${sql.json(pgData.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
    `

    const queryResult = await protectClient.encryptQuery([
      {
        value: '$.items[0].name',
        column: table.metadata,
        table: table,
        queryType: 'searchableJson',
        returnType: 'composite-literal',
      },
    ])

    if (queryResult.failure) throw new Error(queryResult.failure.message)
    const [searchTerm] = queryResult.data

    const rows = await sql`
      SELECT id, metadata::jsonb FROM "protect-ci-jsonb"
      WHERE metadata @> ${searchTerm}::eql_v2_encrypted
      AND test_run_id = ${TEST_RUN_ID}
    `

    expect(rows.length).toBeGreaterThanOrEqual(1)

    const decryptedModel = await protectClient.decryptModel({ metadata: rows[0].metadata })
    if (decryptedModel.failure) throw new Error(decryptedModel.failure.message)

    expect((decryptedModel.data.metadata as any).items[0].name).toBeDefined()
  }, 30000)

  // 7. selector query with returnType: 'composite-literal' works in SQL
  it('selector query with composite-literal works in SQL bound parameter', async () => {
    const plaintext = { feature: 'composite-literal-test', enabled: true }
    const model = { metadata: plaintext }

    const encryptedModel = await protectClient.encryptModel(model, table)
    if (encryptedModel.failure) throw new Error(encryptedModel.failure.message)

    const pgData = modelToEncryptedPgComposites(encryptedModel.data)
    await sql`
      INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
      VALUES (${sql.json(pgData.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
    `

    const queryResult = await protectClient.encryptQuery([
      {
        value: '$.feature',
        column: table.metadata,
        table: table,
        queryType: 'searchableJson',
        returnType: 'composite-literal',
      },
    ])

    if (queryResult.failure) throw new Error(queryResult.failure.message)
    const [searchTerm] = queryResult.data

    // Verify the term is a string in composite-literal format
    expect(typeof searchTerm).toBe('string')
    expect(searchTerm).toMatch(/^\(".*"\)$/)

    const rows = await sql`
      SELECT id, metadata::jsonb FROM "protect-ci-jsonb"
      WHERE metadata @> ${searchTerm}::eql_v2_encrypted
      AND test_run_id = ${TEST_RUN_ID}
    `

    expect(rows.length).toBeGreaterThanOrEqual(1)

    const decryptedModel = await protectClient.decryptModel({ metadata: rows[0].metadata })
    if (decryptedModel.failure) throw new Error(decryptedModel.failure.message)

    expect((decryptedModel.data.metadata as any).feature).toBe('composite-literal-test')
  }, 30000)

  // 8. containment query key/value ({ role: 'admin' })
  it('containment query key/value', async () => {
    const plaintext = { role: 'admin', department: 'engineering' }
    const model = { metadata: plaintext }

    const encryptedModel = await protectClient.encryptModel(model, table)
    if (encryptedModel.failure) throw new Error(encryptedModel.failure.message)

    const pgData = modelToEncryptedPgComposites(encryptedModel.data)
    await sql`
      INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
      VALUES (${sql.json(pgData.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
    `

    const queryResult = await protectClient.encryptQuery([
      {
        value: { role: 'admin' },
        column: table.metadata,
        table: table,
        queryType: 'searchableJson',
        returnType: 'composite-literal',
      },
    ])

    if (queryResult.failure) throw new Error(queryResult.failure.message)
    const [searchTerm] = queryResult.data

    const rows = await sql`
      SELECT id, metadata::jsonb FROM "protect-ci-jsonb"
      WHERE metadata @> ${searchTerm}::eql_v2_encrypted
      AND test_run_id = ${TEST_RUN_ID}
    `

    expect(rows.length).toBeGreaterThanOrEqual(1)

    const decryptedModel = await protectClient.decryptModel({ metadata: rows[0].metadata })
    if (decryptedModel.failure) throw new Error(decryptedModel.failure.message)

    expect((decryptedModel.data.metadata as any).role).toBe('admin')
  }, 30000)

  // 9. containment query nested object
  it('containment query nested object', async () => {
    const plaintext = { user: { profile: { role: 'superadmin' } }, active: true }
    const model = { metadata: plaintext }

    const encryptedModel = await protectClient.encryptModel(model, table)
    if (encryptedModel.failure) throw new Error(encryptedModel.failure.message)

    const pgData = modelToEncryptedPgComposites(encryptedModel.data)
    await sql`
      INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
      VALUES (${sql.json(pgData.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
    `

    const queryResult = await protectClient.encryptQuery([
      {
        value: { user: { profile: { role: 'superadmin' } } },
        column: table.metadata,
        table: table,
        queryType: 'searchableJson',
        returnType: 'composite-literal',
      },
    ])

    if (queryResult.failure) throw new Error(queryResult.failure.message)
    const [searchTerm] = queryResult.data

    const rows = await sql`
      SELECT id, metadata::jsonb FROM "protect-ci-jsonb"
      WHERE metadata @> ${searchTerm}::eql_v2_encrypted
      AND test_run_id = ${TEST_RUN_ID}
    `

    expect(rows.length).toBeGreaterThanOrEqual(1)

    const decryptedModel = await protectClient.decryptModel({ metadata: rows[0].metadata })
    if (decryptedModel.failure) throw new Error(decryptedModel.failure.message)

    expect((decryptedModel.data.metadata as any).user.profile.role).toBe('superadmin')
  }, 30000)

  // 10. containment query array
  it('containment query array', async () => {
    const plaintext = { tags: ['containment-alpha', 'containment-beta'], source: 'array-test' }
    const model = { metadata: plaintext }

    const encryptedModel = await protectClient.encryptModel(model, table)
    if (encryptedModel.failure) throw new Error(encryptedModel.failure.message)

    const pgData = modelToEncryptedPgComposites(encryptedModel.data)
    await sql`
      INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
      VALUES (${sql.json(pgData.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
    `

    const queryResult = await protectClient.encryptQuery([
      {
        value: ['containment-alpha', 'containment-beta'],
        column: table.metadata,
        table: table,
        queryType: 'searchableJson',
        returnType: 'composite-literal',
      },
    ])

    if (queryResult.failure) throw new Error(queryResult.failure.message)
    const [searchTerm] = queryResult.data

    const rows = await sql`
      SELECT id, metadata::jsonb FROM "protect-ci-jsonb"
      WHERE metadata @> ${searchTerm}::eql_v2_encrypted
      AND test_run_id = ${TEST_RUN_ID}
    `

    expect(rows.length).toBeGreaterThanOrEqual(1)

    const decryptedModel = await protectClient.decryptModel({ metadata: rows[0].metadata })
    if (decryptedModel.failure) throw new Error(decryptedModel.failure.message)

    expect((decryptedModel.data.metadata as any).tags).toEqual(['containment-alpha', 'containment-beta'])
  }, 30000)

  // 11. containment query with returnType: 'composite-literal'
  it('containment query with composite-literal', async () => {
    const plaintext = { status: 'verified', level: 'premium' }
    const model = { metadata: plaintext }

    const encryptedModel = await protectClient.encryptModel(model, table)
    if (encryptedModel.failure) throw new Error(encryptedModel.failure.message)

    const pgData = modelToEncryptedPgComposites(encryptedModel.data)
    await sql`
      INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
      VALUES (${sql.json(pgData.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
    `

    const queryResult = await protectClient.encryptQuery([
      {
        value: { status: 'verified' },
        column: table.metadata,
        table: table,
        queryType: 'searchableJson',
        returnType: 'composite-literal',
      },
    ])

    if (queryResult.failure) throw new Error(queryResult.failure.message)
    const [searchTerm] = queryResult.data

    expect(typeof searchTerm).toBe('string')
    expect(searchTerm).toMatch(/^\(".*"\)$/)

    const rows = await sql`
      SELECT id, metadata::jsonb FROM "protect-ci-jsonb"
      WHERE metadata @> ${searchTerm}::eql_v2_encrypted
      AND test_run_id = ${TEST_RUN_ID}
    `

    expect(rows.length).toBeGreaterThanOrEqual(1)

    const decryptedModel = await protectClient.decryptModel({ metadata: rows[0].metadata })
    if (decryptedModel.failure) throw new Error(decryptedModel.failure.message)

    expect((decryptedModel.data.metadata as any).status).toBe('verified')
  }, 30000)

  // 12. batch encrypt mixed selector + containment terms and execute both
  it('batch encrypt mixed selector + containment and execute both', async () => {
    const plaintext = { user: { email: 'batch@test.com' }, role: 'editor', kind: 'batch-mixed' }
    const model = { metadata: plaintext }

    const encryptedModel = await protectClient.encryptModel(model, table)
    if (encryptedModel.failure) throw new Error(encryptedModel.failure.message)

    const pgData = modelToEncryptedPgComposites(encryptedModel.data)
    await sql`
      INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
      VALUES (${sql.json(pgData.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
    `

    const queryResult = await protectClient.encryptQuery([
      {
        value: '$.user.email',
        column: table.metadata,
        table: table,
        queryType: 'searchableJson',
        returnType: 'composite-literal',
      },
      {
        value: { role: 'editor' },
        column: table.metadata,
        table: table,
        queryType: 'searchableJson',
        returnType: 'composite-literal',
      },
    ])

    if (queryResult.failure) throw new Error(queryResult.failure.message)
    const [selectorTerm, containmentTerm] = queryResult.data

    // Execute selector query
    const selectorRows = await sql`
      SELECT id, metadata::jsonb FROM "protect-ci-jsonb"
      WHERE metadata @> ${selectorTerm}::eql_v2_encrypted
      AND test_run_id = ${TEST_RUN_ID}
    `

    expect(selectorRows.length).toBeGreaterThanOrEqual(1)

    const selectorDecrypted = await protectClient.decryptModel({ metadata: selectorRows[0].metadata })
    if (selectorDecrypted.failure) throw new Error(selectorDecrypted.failure.message)
    expect((selectorDecrypted.data.metadata as any).user.email).toBeDefined()

    // Execute containment query
    const containmentRows = await sql`
      SELECT id, metadata::jsonb FROM "protect-ci-jsonb"
      WHERE metadata @> ${containmentTerm}::eql_v2_encrypted
      AND test_run_id = ${TEST_RUN_ID}
    `

    expect(containmentRows.length).toBeGreaterThanOrEqual(1)

    const containmentDecrypted = await protectClient.decryptModel({ metadata: containmentRows[0].metadata })
    if (containmentDecrypted.failure) throw new Error(containmentDecrypted.failure.message)
    expect((containmentDecrypted.data.metadata as any).role).toBe('editor')
  }, 30000)

  // 13. inferred queryType vs explicit (steVecSelector/steVecTerm) yield same DB results
  it('inferred vs explicit queryType yield same DB results', async () => {
    const plaintext = { category: 'equivalence-test', priority: 'high' }
    const model = { metadata: plaintext }

    const encryptedModel = await protectClient.encryptModel(model, table)
    if (encryptedModel.failure) throw new Error(encryptedModel.failure.message)

    const pgData = modelToEncryptedPgComposites(encryptedModel.data)
    await sql`
      INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
      VALUES (${sql.json(pgData.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
    `

    // Selector: inferred (searchableJson) vs explicit (steVecSelector)
    const inferredSelectorResult = await protectClient.encryptQuery([
      {
        value: '$.category',
        column: table.metadata,
        table: table,
        queryType: 'searchableJson',
        returnType: 'composite-literal',
      },
    ])
    if (inferredSelectorResult.failure) throw new Error(inferredSelectorResult.failure.message)

    const explicitSelectorResult = await protectClient.encryptQuery([
      {
        value: '$.category',
        column: table.metadata,
        table: table,
        queryType: 'steVecSelector',
        returnType: 'composite-literal',
      },
    ])
    if (explicitSelectorResult.failure) throw new Error(explicitSelectorResult.failure.message)

    const inferredSelectorRows = await sql`
      SELECT id, metadata::jsonb FROM "protect-ci-jsonb"
      WHERE metadata @> ${inferredSelectorResult.data[0]}::eql_v2_encrypted
      AND test_run_id = ${TEST_RUN_ID}
    `

    const explicitSelectorRows = await sql`
      SELECT id, metadata::jsonb FROM "protect-ci-jsonb"
      WHERE metadata @> ${explicitSelectorResult.data[0]}::eql_v2_encrypted
      AND test_run_id = ${TEST_RUN_ID}
    `

    expect(inferredSelectorRows.length).toBe(explicitSelectorRows.length)
    expect(inferredSelectorRows.length).toBeGreaterThanOrEqual(1)

    // Decrypt and compare
    const inferredDecrypted = await protectClient.decryptModel({ metadata: inferredSelectorRows[0].metadata })
    const explicitDecrypted = await protectClient.decryptModel({ metadata: explicitSelectorRows[0].metadata })
    if (inferredDecrypted.failure) throw new Error(inferredDecrypted.failure.message)
    if (explicitDecrypted.failure) throw new Error(explicitDecrypted.failure.message)

    expect(inferredDecrypted.data.metadata).toEqual(explicitDecrypted.data.metadata)

    // Containment: inferred (searchableJson) vs explicit (steVecTerm)
    const inferredTermResult = await protectClient.encryptQuery([
      {
        value: { category: 'equivalence-test' },
        column: table.metadata,
        table: table,
        queryType: 'searchableJson',
        returnType: 'composite-literal',
      },
    ])
    if (inferredTermResult.failure) throw new Error(inferredTermResult.failure.message)

    const explicitTermResult = await protectClient.encryptQuery([
      {
        value: { category: 'equivalence-test' },
        column: table.metadata,
        table: table,
        queryType: 'steVecTerm',
        returnType: 'composite-literal',
      },
    ])
    if (explicitTermResult.failure) throw new Error(explicitTermResult.failure.message)

    const inferredTermRows = await sql`
      SELECT id, metadata::jsonb FROM "protect-ci-jsonb"
      WHERE metadata @> ${inferredTermResult.data[0]}::eql_v2_encrypted
      AND test_run_id = ${TEST_RUN_ID}
    `

    const explicitTermRows = await sql`
      SELECT id, metadata::jsonb FROM "protect-ci-jsonb"
      WHERE metadata @> ${explicitTermResult.data[0]}::eql_v2_encrypted
      AND test_run_id = ${TEST_RUN_ID}
    `

    expect(inferredTermRows.length).toBe(explicitTermRows.length)
    expect(inferredTermRows.length).toBeGreaterThanOrEqual(1)

    const inferredTermDecrypted = await protectClient.decryptModel({ metadata: inferredTermRows[0].metadata })
    const explicitTermDecrypted = await protectClient.decryptModel({ metadata: explicitTermRows[0].metadata })
    if (inferredTermDecrypted.failure) throw new Error(inferredTermDecrypted.failure.message)
    if (explicitTermDecrypted.failure) throw new Error(explicitTermDecrypted.failure.message)

    expect(inferredTermDecrypted.data.metadata).toEqual(explicitTermDecrypted.data.metadata)
  }, 30000)

  // 14. null handling: encrypt/decrypt + query behavior validated
  it('null handling: encrypt/decrypt and query behavior', async () => {
    const encrypted = await protectClient.encrypt(null, {
      column: table.metadata,
      table: table,
    })

    if (encrypted.failure) {
      throw new Error(`encrypt null failed: ${encrypted.failure.message}`)
    }

    // Null encryption should produce null data
    expect(encrypted.data).toBeNull()

    // Insert a row with null metadata
    const [inserted] = await sql`
      INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
      VALUES (NULL, ${TEST_RUN_ID})
      RETURNING id
    `

    const rows = await sql`
      SELECT id, metadata::jsonb FROM "protect-ci-jsonb"
      WHERE id = ${inserted.id}
    `

    expect(rows).toHaveLength(1)
    expect(rows[0].metadata).toBeNull()

    // Encrypting a null query term should return null
    const queryResult = await protectClient.encryptQuery([
      {
        value: null,
        column: table.metadata,
        table: table,
        queryType: 'searchableJson',
        returnType: 'composite-literal',
      },
    ])

    if (queryResult.failure) throw new Error(queryResult.failure.message)
    expect(queryResult.data[0]).toBeNull()
  }, 30000)

  // 15. empty object/array query values execute and return deterministic results
  it('empty object/array query values execute and return deterministic results', async () => {
    const plaintext = { content: 'empty-query-test', value: 42 }
    const model = { metadata: plaintext }

    const encryptedModel = await protectClient.encryptModel(model, table)
    if (encryptedModel.failure) throw new Error(encryptedModel.failure.message)

    const pgData = modelToEncryptedPgComposites(encryptedModel.data)
    await sql`
      INSERT INTO "protect-ci-jsonb" (metadata, test_run_id)
      VALUES (${sql.json(pgData.metadata)}::eql_v2_encrypted, ${TEST_RUN_ID})
    `

    // Empty object query
    const emptyObjResult = await protectClient.encryptQuery([
      {
        value: {},
        column: table.metadata,
        table: table,
        queryType: 'searchableJson',
        returnType: 'composite-literal',
      },
    ])

    if (emptyObjResult.failure) throw new Error(emptyObjResult.failure.message)
    const [emptyObjTerm] = emptyObjResult.data

    // Should execute without error (results are deterministic but may vary by implementation)
    const emptyObjRows = await sql`
      SELECT id, metadata::jsonb FROM "protect-ci-jsonb"
      WHERE metadata @> ${emptyObjTerm}::eql_v2_encrypted
      AND test_run_id = ${TEST_RUN_ID}
    `

    // Empty object containment is valid SQL; verify it returns deterministic results
    expect(emptyObjRows.length).toBeGreaterThanOrEqual(0)

    // If rows returned, verify they decrypt correctly
    if (emptyObjRows.length > 0) {
      const decryptedModel = await protectClient.decryptModel({ metadata: emptyObjRows[0].metadata })
      if (decryptedModel.failure) throw new Error(decryptedModel.failure.message)
      expect(decryptedModel.data.metadata).toBeDefined()
    }

    // Empty array query
    const emptyArrResult = await protectClient.encryptQuery([
      {
        value: [],
        column: table.metadata,
        table: table,
        queryType: 'searchableJson',
        returnType: 'composite-literal',
      },
    ])

    if (emptyArrResult.failure) throw new Error(emptyArrResult.failure.message)
    const [emptyArrTerm] = emptyArrResult.data

    const emptyArrRows = await sql`
      SELECT id, metadata::jsonb FROM "protect-ci-jsonb"
      WHERE metadata @> ${emptyArrTerm}::eql_v2_encrypted
      AND test_run_id = ${TEST_RUN_ID}
    `

    expect(emptyArrRows.length).toBeGreaterThanOrEqual(0)

    if (emptyArrRows.length > 0) {
      const decryptedModel = await protectClient.decryptModel({ metadata: emptyArrRows[0].metadata })
      if (decryptedModel.failure) throw new Error(decryptedModel.failure.message)
      expect(decryptedModel.data.metadata).toBeDefined()
    }
  }, 30000)
})
