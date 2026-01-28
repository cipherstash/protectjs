import 'dotenv/config'
import { csColumn, csTable } from '@cipherstash/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { protect } from '../src'
import { queryTypes } from '../src/types'

const users = csTable('users', {
  email: csColumn('email').freeTextSearch().equality().orderAndRange(),
  score: csColumn('score').dataType('number').orderAndRange(),
})

// Schema with searchableJson for ste_vec tests
const jsonSchema = csTable('json_users', {
  metadata: csColumn('metadata').searchableJson(),
})

let protectClient: Awaited<ReturnType<typeof protect>>

beforeAll(async () => {
  protectClient = await protect({ schemas: [users, jsonSchema] })
})

describe('encryptQuery', () => {
  it('should encrypt query with unique index', async () => {
    const result = await protectClient.encryptQuery('test@example.com', {
      column: users.email,
      table: users,
      queryType: queryTypes.equality,
    })

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    // Unique index returns 'hm' (HMAC)
    expect(result.data).toHaveProperty('hm')
  })

  it('should encrypt query with ore index', async () => {
    const result = await protectClient.encryptQuery(100, {
      column: users.score,
      table: users,
      queryType: queryTypes.orderAndRange,
    })

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    // Check for some metadata keys besides identifier 'i' and version 'v'
    const keys = Object.keys(result.data || {})
    const metaKeys = keys.filter((k) => k !== 'i' && k !== 'v')
    expect(metaKeys.length).toBeGreaterThan(0)
  })

  it('should encrypt query with match index', async () => {
    const result = await protectClient.encryptQuery('test', {
      column: users.email,
      table: users,
      queryType: queryTypes.freeTextSearch,
    })

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    const keys = Object.keys(result.data || {})
    const metaKeys = keys.filter((k) => k !== 'i' && k !== 'v')
    expect(metaKeys.length).toBeGreaterThan(0)
  })

  it('should handle null value in encryptQuery', async () => {
    const result = await protectClient.encryptQuery(null, {
      column: users.email,
      table: users,
      queryType: queryTypes.equality,
    })

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    // Null should produce null output (passthrough behavior)
    expect(result.data).toBeNull()
  })
})
