import 'dotenv/config'
import { csColumn, csTable } from '@cipherstash/schema'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  type Encrypted,
  bulkModelsToEncryptedPgComposites,
  encryptedToPgComposite,
  isEncryptedPayload,
  modelToEncryptedPgComposites,
  protect,
} from '../src'

import { createClient } from '@supabase/supabase-js'

if (!process.env.SUPABASE_URL) {
  throw new Error('Missing env.SUPABASE_URL')
}
if (!process.env.SUPABASE_ANON_KEY) {
  throw new Error('Missing env.SUPABASE_ANON_KEY')
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
)

const table = csTable('protect-ci', {
  encrypted: csColumn('encrypted').freeTextSearch().equality(),
  age: csColumn('age').dataType('number').equality(),
  score: csColumn('score').dataType('number').equality(),
})

// Hard code this as the CI database doesn't support order by on encrypted columns
const SKIP_ORDER_BY_TEST = true

// Unique identifier for this test run to isolate data from concurrent test runs
// This is stored in a dedicated test_run_id column to avoid polluting test data
const TEST_RUN_ID = `test-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

// Track all inserted IDs for cleanup
const insertedIds: number[] = []

beforeAll(async () => {
  // Clean up any data from this specific test run (safe for concurrent runs)
  const { error } = await supabase
    .from('protect-ci')
    .delete()
    .eq('test_run_id', TEST_RUN_ID)

  if (error) {
    console.warn(`[protect]: Failed to clean up test data: ${error.message}`)
  }
})

afterAll(async () => {
  // Clean up all data from this test run
  if (insertedIds.length > 0) {
    const { error } = await supabase
      .from('protect-ci')
      .delete()
      .in('id', insertedIds)
    if (error) {
      console.error(`[protect]: Failed to clean up test data: ${error.message}`)
    }
  }
})

describe('supabase', () => {
  it('should insert and select encrypted data', async () => {
    const protectClient = await protect({ schemas: [table] })

    const e = 'hello world'

    const ciphertext = await protectClient.encrypt(e, {
      column: table.encrypted,
      table: table,
    })

    if (ciphertext.failure) {
      throw new Error(`[protect]: ${ciphertext.failure.message}`)
    }

    const { data: insertedData, error: insertError } = await supabase
      .from('protect-ci')
      .insert({
        encrypted: encryptedToPgComposite(ciphertext.data),
        test_run_id: TEST_RUN_ID,
      })
      .select('id')

    if (insertError) {
      throw new Error(`[protect]: ${insertError.message}`)
    }

    insertedIds.push(insertedData[0].id)

    const { data, error } = await supabase
      .from('protect-ci')
      .select('id, encrypted::jsonb')
      .eq('id', insertedData[0].id)

    if (error) {
      throw new Error(`[protect]: ${error.message}`)
    }

    const dataToDecrypt = data[0].encrypted as Encrypted
    const plaintext = await protectClient.decrypt(dataToDecrypt)

    expect(plaintext).toEqual({
      data: e,
    })
  }, 30000)

  it('should insert and select encrypted model data', async () => {
    const protectClient = await protect({ schemas: [table] })

    const model = {
      encrypted: 'hello world',
      otherField: 'not encrypted',
    }

    const encryptedModel = await protectClient.encryptModel(model, table)

    if (encryptedModel.failure) {
      throw new Error(`[protect]: ${encryptedModel.failure.message}`)
    }

    const { data: insertedData, error: insertError } = await supabase
      .from('protect-ci')
      .insert([
        {
          ...modelToEncryptedPgComposites(encryptedModel.data),
          test_run_id: TEST_RUN_ID,
        },
      ])
      .select('id')

    if (insertError) {
      throw new Error(`[protect]: ${insertError.message}`)
    }

    insertedIds.push(insertedData[0].id)

    const { data, error } = await supabase
      .from('protect-ci')
      .select('id, encrypted::jsonb, otherField')
      .eq('id', insertedData[0].id)

    if (error) {
      throw new Error(`[protect]: ${error.message}`)
    }

    if (!isEncryptedPayload(data[0].encrypted)) {
      throw new Error('Expected encrypted payload')
    }

    const decryptedModel = await protectClient.decryptModel(data[0])

    if (decryptedModel.failure) {
      throw new Error(`[protect]: ${decryptedModel.failure.message}`)
    }

    expect({
      encrypted: decryptedModel.data.encrypted,
      otherField: data[0].otherField,
    }).toEqual(model)
  }, 30000)

  it('should insert and select bulk encrypted model data', async () => {
    const protectClient = await protect({ schemas: [table] })

    const models = [
      {
        encrypted: 'hello world 1',
        otherField: 'not encrypted 1',
      },
      {
        encrypted: 'hello world 2',
        otherField: 'not encrypted 2',
      },
    ]

    const encryptedModels = await protectClient.bulkEncryptModels(models, table)

    if (encryptedModels.failure) {
      throw new Error(`[protect]: ${encryptedModels.failure.message}`)
    }

    const dataToInsert = bulkModelsToEncryptedPgComposites(
      encryptedModels.data,
    ).map((row) => ({
      ...row,
      test_run_id: TEST_RUN_ID,
    }))

    const { data: insertedData, error: insertError } = await supabase
      .from('protect-ci')
      .insert(dataToInsert)
      .select('id')

    if (insertError) {
      throw new Error(`[protect]: ${insertError.message}`)
    }

    insertedIds.push(...insertedData.map((d: { id: number }) => d.id))

    const { data, error } = await supabase
      .from('protect-ci')
      .select('id, encrypted::jsonb, otherField')
      .in(
        'id',
        insertedData.map((d: { id: number }) => d.id),
      )

    if (error) {
      throw new Error(`[protect]: ${error.message}`)
    }

    const decryptedModels = await protectClient.bulkDecryptModels(data)

    if (decryptedModels.failure) {
      throw new Error(`[protect]: ${decryptedModels.failure.message}`)
    }

    expect(
      decryptedModels.data.map((d) => {
        return {
          encrypted: d.encrypted,
          otherField: d.otherField,
        }
      }),
    ).toEqual(models)
  }, 30000)

  it('should insert and query encrypted number data with equality', async () => {
    const protectClient = await protect({ schemas: [table] })

    const testAge = 25
    const model = {
      age: testAge,
      otherField: 'not encrypted',
    }

    const encryptedModel = await protectClient.encryptModel(model, table)

    if (encryptedModel.failure) {
      throw new Error(`[protect]: ${encryptedModel.failure.message}`)
    }

    const insertResult = await supabase
      .from('protect-ci')
      .insert([
        {
          ...modelToEncryptedPgComposites(encryptedModel.data),
          test_run_id: TEST_RUN_ID,
        },
      ])
      .select('id')

    if (insertResult.error) {
      throw new Error(`[protect]: ${insertResult.error.message}`)
    }

    const insertedRecordId = insertResult.data[0].id
    insertedIds.push(insertedRecordId)

    // Create search term for equality query
    const searchTerm = await protectClient.createSearchTerms([
      {
        value: testAge,
        column: table.age,
        table: table,
        returnType: 'composite-literal',
      },
    ])

    if (searchTerm.failure) {
      throw new Error(`[protect]: ${searchTerm.failure.message}`)
    }

    // Query filtering by both encrypted age AND our specific test run's ID
    // This ensures we don't pick up stale data from other test runs
    const { data, error } = await supabase
      .from('protect-ci')
      .select('id, age::jsonb, otherField')
      .eq('age', searchTerm.data[0])
      .eq('test_run_id', TEST_RUN_ID)

    if (error) {
      throw new Error(`[protect]: ${error.message}`)
    }

    // Verify we found our specific row with encrypted age match
    expect(data).toHaveLength(1)

    const decryptedModel = await protectClient.decryptModel(data[0])

    if (decryptedModel.failure) {
      throw new Error(`[protect]: ${decryptedModel.failure.message}`)
    }

    expect(decryptedModel.data.age).toBe(testAge)
  }, 30000)
})
