import 'dotenv/config'
import { describe, expect, it } from 'vitest'

import {
  protect,
  csTable,
  csColumn,
  type EncryptedPayload,
  encryptedToPgComposite,
  modelToEncryptedPgComposites,
  isEncryptedPayload,
  bulkModelsToEncryptedPgComposites,
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
  encrypted: csColumn('encrypted').freeTextSearch().equality().orderAndRange(),
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

    const dataToDecrypt = data[0].encrypted as EncryptedPayload
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
        insertedData.map((d) => d.id),
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
        insertedData.map((d) => d.id),
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
})
