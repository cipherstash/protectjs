import 'dotenv/config'
import { csColumn, csTable, csValue } from '@cipherstash/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { protect } from '../src'

const users = csTable('users', {
  email: csColumn('email').freeTextSearch().equality().orderAndRange(),
  json: csColumn('json').dataType('jsonb'),
  jsonSearchable: csColumn('jsonSearchable')
    .dataType('jsonb')
    .searchableJson('users/jsonSearchable'),
})

type User = {
  id: string
  email?: string | null
  createdAt?: Date
  updatedAt?: Date
  address?: string | null
  json?: Record<string, unknown> | null
  metadata?: {
    profile?: Record<string, unknown> | null
    settings?: {
      preferences?: Record<string, unknown> | null
    }
  }
}

let protectClient: Awaited<ReturnType<typeof protect>>

beforeAll(async () => {
  protectClient = await protect({
    schemas: [users],
  })
})

// Add your tests here when ready
