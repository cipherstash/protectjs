import 'dotenv/config'
import { csColumn, csTable } from '@cipherstash/schema'
import { beforeAll, describe, expect, it } from 'vitest'
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
  encrypted: csColumn('encrypted').freeTextSearch().equality().orderAndRange(),
  age: csColumn('age').dataType('number').equality().orderAndRange(),
  score: csColumn('score').dataType('number').equality().orderAndRange(),
})

// Hard code this as the CI database doesn't support order by on encrypted columns
const SKIP_ORDER_BY_TEST = true

beforeAll(async () => {
  // Truncate the table before running tests
  const { error } = await supabase.from('protect-ci').delete().neq('id', 0)
  if (error) {
    throw new Error(`[protect]: Failed to truncate table: ${error.message}`)
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

      if (error) {
        throw new Error(`[protect]: ${error.message}`)
      }

      expect(data).toHaveLength(1)
      expect(data[0].id).toBe(insertedData[0].id)

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

  it('should insert and query encrypted number data with range queries', async () => {
    let insertedData: { id: number }[] = []

    try {
      const protectClient = await protect({ schemas: [table] })

      const testScores = [15, 25, 35, 45, 55]
      const models = testScores.map((score) => ({
        score: score,
        otherField: `score-${score}`,
      }))

      const encryptedModels = await protectClient.bulkEncryptModels(
        models,
        table,
      )

      if (encryptedModels.failure) {
        throw new Error(`[protect]: ${encryptedModels.failure.message}`)
      }

      const { data: insertResult, error: insertError } = await supabase
        .from('protect-ci')
        .insert(bulkModelsToEncryptedPgComposites(encryptedModels.data))
        .select('id')

      if (insertError) {
        throw new Error(`[protect]: ${insertError.message}`)
      }

      insertedData = insertResult

      // Test range query: scores >= 30
      const minScoreTerm = await protectClient.createSearchTerms([
        {
          value: 30,
          column: table.score,
          table: table,
          returnType: 'composite-literal',
        },
      ])

      if (minScoreTerm.failure) {
        throw new Error(`[protect]: ${minScoreTerm.failure.message}`)
      }

      const { data: rangeData, error: rangeError } = await supabase
        .from('protect-ci')
        .select('id, score::jsonb, otherField')
        .gte('score', minScoreTerm.data[0])

      if (rangeError) {
        throw new Error(`[protect]: ${rangeError.message}`)
      }

      expect(rangeData).toHaveLength(3) // Should find scores 35, 45, 55

      const decryptedRangeData =
        await protectClient.bulkDecryptModels(rangeData)

      if (decryptedRangeData.failure) {
        throw new Error(`[protect]: ${decryptedRangeData.failure.message}`)
      }

      const foundScores = decryptedRangeData.data
        .map((d) => d.score)
        .filter(
          (score): score is number => score !== null && score !== undefined,
        )
        .sort((a, b) => a - b)

      expect(foundScores).toEqual([35, 45, 55])
    } finally {
      // Cleanup - always runs regardless of success or failure
      if (insertedData.length > 0) {
        const deleteResult = await supabase
          .from('protect-ci')
          .delete()
          .in(
            'id',
            insertedData.map((d: { id: number }) => d.id),
          )

        if (deleteResult.error) {
          console.error(
            'Failed to delete test data:',
            deleteResult.error.message,
          )
        }
      }
    }
  }, 30000)

  it('should insert and sort encrypted number data', async () => {
    if (SKIP_ORDER_BY_TEST) {
      console.log('Skipping order by test - not supported by this database')
      return
    }

    let insertedData: { id: number }[] = []

    try {
      const protectClient = await protect({ schemas: [table] })

      const testAges = [45, 25, 35, 15, 55]
      const models = testAges.map((age) => ({
        age: age,
        otherField: `age-${age}`,
      }))

      const encryptedModels = await protectClient.bulkEncryptModels(
        models,
        table,
      )

      if (encryptedModels.failure) {
        throw new Error(`[protect]: ${encryptedModels.failure.message}`)
      }

      const { data: insertResult, error: insertError } = await supabase
        .from('protect-ci')
        .insert(bulkModelsToEncryptedPgComposites(encryptedModels.data))
        .select('id')

      if (insertError) {
        throw new Error(`[protect]: ${insertError.message}`)
      }

      insertedData = insertResult

      // Test sorting by age (ascending)
      const { data: sortedData, error: sortError } = await supabase
        .from('protect-ci')
        .select('id, age::jsonb, otherField')
        .in(
          'id',
          insertedData.map((d: { id: number }) => d.id),
        )
        .order('age', { ascending: true })

      if (sortError) {
        throw new Error(`[protect]: ${sortError.message}`)
      }

      const decryptedSortedData =
        await protectClient.bulkDecryptModels(sortedData)

      if (decryptedSortedData.failure) {
        throw new Error(`[protect]: ${decryptedSortedData.failure.message}`)
      }

      const sortedAges = decryptedSortedData.data.map((d) => d.age)

      expect(sortedAges).toEqual([15, 25, 35, 45, 55])
    } finally {
      // Cleanup - always runs regardless of success or failure
      if (insertedData.length > 0) {
        const deleteResult = await supabase
          .from('protect-ci')
          .delete()
          .in(
            'id',
            insertedData.map((d: { id: number }) => d.id),
          )

        if (deleteResult.error) {
          console.error(
            'Failed to delete test data:',
            deleteResult.error.message,
          )
        }
      }
    }
  }, 30000)

  it('should handle complex number queries with multiple conditions', async () => {
    let insertedData: { id: number }[] = []

    try {
      const protectClient = await protect({ schemas: [table] })

      const testData = [
        { age: 20, score: 80 },
        { age: 25, score: 90 },
        { age: 30, score: 75 },
        { age: 35, score: 85 },
        { age: 40, score: 75 },
      ]

      const models = testData.map((data, index) => ({
        age: data.age,
        score: data.score,
        otherField: `user-${index}`,
      }))

      const encryptedModels = await protectClient.bulkEncryptModels(
        models,
        table,
      )

      if (encryptedModels.failure) {
        throw new Error(`[protect]: ${encryptedModels.failure.message}`)
      }

      const { data: insertResult, error: insertError } = await supabase
        .from('protect-ci')
        .insert(bulkModelsToEncryptedPgComposites(encryptedModels.data))
        .select('id')

      if (insertError) {
        throw new Error(`[protect]: ${insertError.message}`)
      }

      insertedData = insertResult

      // Create search terms for range queries
      const terms = await protectClient.createSearchTerms([
        {
          value: 25,
          column: table.age,
          table: table,
          returnType: 'composite-literal',
        },
        {
          value: 35,
          column: table.age,
          table: table,
          returnType: 'composite-literal',
        },
        {
          value: 75,
          column: table.score,
          table: table,
          returnType: 'composite-literal',
        },
      ])

      if (terms.failure) {
        throw new Error('[protect]: Search term creation failed')
      }

      // Query: age >= 25 AND age <= 35 AND score >= 75
      const { data: filteredData, error: filterError } = await supabase
        .from('protect-ci')
        .select('id, age::jsonb, score::jsonb, otherField')
        .gte('age', terms.data[0])
        .lte('age', terms.data[1])
        .gte('score', terms.data[2])
        .in(
          'id',
          insertedData.map((d: { id: number }) => d.id),
        )

      if (filterError) {
        throw new Error(`[protect]: ${filterError.message}`)
      }

      const decryptedFilteredData =
        await protectClient.bulkDecryptModels(filteredData)

      if (decryptedFilteredData.failure) {
        throw new Error(`[protect]: ${decryptedFilteredData.failure.message}`)
      }

      // Should find: { age: 25, score: 90 }, { age: 30, score: 75 }, { age: 35, score: 85 }
      expect(decryptedFilteredData.data).toHaveLength(3)

      const foundData = decryptedFilteredData.data.map((d) => ({
        age: d.age,
        score: d.score,
      }))

      expect(foundData).toEqual(
        expect.arrayContaining([
          { age: 25, score: 90 },
          { age: 30, score: 75 },
          { age: 35, score: 85 },
        ]),
      )
    } finally {
      // Cleanup - always runs regardless of success or failure
      if (insertedData.length > 0) {
        const deleteResult = await supabase
          .from('protect-ci')
          .delete()
          .in(
            'id',
            insertedData.map((d: { id: number }) => d.id),
          )

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
