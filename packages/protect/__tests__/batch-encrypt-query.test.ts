import 'dotenv/config'
import { csColumn, csTable } from '@cipherstash/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { protect, type QueryTerm } from '../src'

const users = csTable('users', {
  email: csColumn('email').freeTextSearch().equality().orderAndRange(),
  score: csColumn('score').dataType('number').orderAndRange(),
})

const jsonSchema = csTable('json_users', {
  metadata: csColumn('metadata').searchableJson(),
})

let protectClient: Awaited<ReturnType<typeof protect>>

beforeAll(async () => {
  protectClient = await protect({ schemas: [users, jsonSchema] })
})

describe('encryptQuery batch overload', () => {
  it('should encrypt batch of scalar terms', async () => {
    const terms: QueryTerm[] = [
      { value: 'test@example.com', column: users.email, table: users, indexType: 'unique' },
      { value: 100, column: users.score, table: users, indexType: 'ore' },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(2)
    expect(result.data[0]).toHaveProperty('hm') // unique returns HMAC
  })
})
