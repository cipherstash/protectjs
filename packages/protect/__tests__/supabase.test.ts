import 'dotenv/config'
import { csColumn, csTable } from '@cipherstash/schema'
import { describe, expect, it } from 'vitest'
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
      .insert({ encrypted: encryptedToPgComposite(ciphertext.data) })
      .select('id')

    if (insertError) {
      throw new Error(`[protect]: ${insertError.message}`)
    }

    const { data, error } = await supabase
      .from('protect-ci')
      .select('id, encrypted::jsonb')
      .eq('id', insertedData[0].id)

    if (error) {
      throw new Error(`[protect]: ${error.message}`)
    }

    const dataToDecrypt = data[0].encrypted as Encrypted
    const plaintext = await protectClient.decrypt(dataToDecrypt)

    await supabase.from('protect-ci').delete().eq('id', insertedData[0].id)

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
      .insert([modelToEncryptedPgComposites(encryptedModel.data)])
      .select('id')

    if (insertError) {
      throw new Error(`[protect]: ${insertError.message}`)
    }

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

    await supabase.from('protect-ci').delete().eq('id', insertedData[0].id)

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

    const { data: insertedData, error: insertError } = await supabase
      .from('protect-ci')
      .insert(bulkModelsToEncryptedPgComposites(encryptedModels.data))
      .select('id')

    if (insertError) {
      throw new Error(`[protect]: ${insertError.message}`)
    }

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

    await supabase
      .from('protect-ci')
      .delete()
      .in(
        'id',
        insertedData.map((d: { id: number }) => d.id),
      )

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
    let insertedData: { id: number }[] = []

    try {
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
        .insert([modelToEncryptedPgComposites(encryptedModel.data)])
        .select('id')

      if (insertResult.error) {
        throw new Error(`[protect]: ${insertResult.error.message}`)
      }

      insertedData = insertResult.data

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

      const { data, error } = await supabase
        .from('protect-ci')
        .select('id, age::jsonb, otherField')
        .eq('age', searchTerm.data[0])
        .eq('id', insertedData[0].id)

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
    } finally {
      // Cleanup - always runs regardless of success or failure
      if (insertedData.length > 0) {
        const deleteResult = await supabase
          .from('protect-ci')
          .delete()
          .eq('id', insertedData[0].id)
        if (deleteResult.error) {
          console.error(
            'Failed to delete test data:',
            deleteResult.error.message,
          )
        }
      }
    }
  }, 30000)
})
