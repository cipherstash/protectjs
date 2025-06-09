import 'dotenv/config'
import { describe, expect, it, vi } from 'vitest'

import { LockContext, protect, csTable, csColumn } from '../src'

const users = csTable('users', {
  email: csColumn('email').freeTextSearch().equality().orderAndRange(),
  address: csColumn('address').freeTextSearch(),
  example: {
    field: csColumn('field').freeTextSearch(),
    nested: {
      deeper: csColumn('deeper').freeTextSearch(),
    },
  },
})

type User = {
  id: string
  email?: string | null
  createdAt?: Date
  updatedAt?: Date
  address?: string | null
  notEncrypted?: string | null
  example: {
    field: string | undefined | null
    nested?: {
      deeper: string | undefined | null
    }
  }
}

describe('encrypt models with nested fields', () => {
  it('should encrypt and decrypt a model with nested fields', async () => {
    const protectClient = await protect({ schemas: [users] })

    const decryptedModel = {
      id: '1',
      email: 'test@example.com',
      address: '123 Main St',
      notEncrypted: 'not encrypted',
      createdAt: new Date('2021-01-01'),
      updatedAt: new Date('2021-01-01'),
      example: {
        field: 'test',
      },
    }

    const encryptedModel = await protectClient.encryptModel<User>(
      decryptedModel,
      users,
    )

    if (encryptedModel.failure) {
      throw new Error(`[protect]: ${encryptedModel.failure.message}`)
    }

    console.log('data that is encrypted', encryptedModel.data.example.field)

    const decryptedResult = await protectClient.decryptModel<User>(
      encryptedModel.data,
    )

    if (decryptedResult.failure) {
      throw new Error(`[protect]: ${decryptedResult.failure.message}`)
    }

    expect(decryptedResult.data).toEqual(decryptedModel)
  }, 30000)

  it('should handle null values in nested fields', async () => {
    const protectClient = await protect({ schemas: [users] })

    const decryptedModel = {
      id: '2',
      email: null,
      address: null,
      example: {
        field: null,
        nested: {
          deeper: null,
        },
      },
    }

    const encryptedModel = await protectClient.encryptModel<User>(
      decryptedModel,
      users,
    )

    if (encryptedModel.failure) {
      throw new Error(`[protect]: ${encryptedModel.failure.message}`)
    }

    const decryptedResult = await protectClient.decryptModel<User>(
      encryptedModel.data,
    )

    if (decryptedResult.failure) {
      throw new Error(`[protect]: ${decryptedResult.failure.message}`)
    }

    expect(decryptedResult.data).toEqual(decryptedModel)
  }, 30000)

  it('should handle undefined values in nested fields', async () => {
    const protectClient = await protect({ schemas: [users] })

    const decryptedModel = {
      id: '3',
      example: {
        field: undefined,
        nested: {
          deeper: undefined,
        },
      },
    }

    const encryptedModel = await protectClient.encryptModel<User>(
      decryptedModel,
      users,
    )

    if (encryptedModel.failure) {
      throw new Error(`[protect]: ${encryptedModel.failure.message}`)
    }

    const decryptedResult = await protectClient.decryptModel<User>(
      encryptedModel.data,
    )

    if (decryptedResult.failure) {
      throw new Error(`[protect]: ${decryptedResult.failure.message}`)
    }

    expect(decryptedResult.data).toEqual(decryptedModel)
  }, 30000)

  it('should handle mixed null and undefined values in nested fields', async () => {
    const protectClient = await protect({ schemas: [users] })

    const decryptedModel = {
      id: '4',
      email: 'test@example.com',
      address: undefined,
      notEncrypted: 'not encrypted',
      createdAt: new Date('2021-01-01'),
      updatedAt: new Date('2021-01-01'),
      example: {
        field: null,
        nested: {
          deeper: undefined,
        },
      },
    }

    const encryptedModel = await protectClient.encryptModel<User>(
      decryptedModel,
      users,
    )

    if (encryptedModel.failure) {
      throw new Error(`[protect]: ${encryptedModel.failure.message}`)
    }

    console.log('data that is encrypted', encryptedModel.data)

    const decryptedResult = await protectClient.decryptModel<User>(
      encryptedModel.data,
    )

    if (decryptedResult.failure) {
      throw new Error(`[protect]: ${decryptedResult.failure.message}`)
    }

    console.log('data that is decrypted', decryptedResult.data)

    expect(decryptedResult.data).toEqual(decryptedModel)
  }, 30000)

  it('should handle deeply nested fields', async () => {
    const protectClient = await protect({ schemas: [users] })

    const decryptedModel = {
      id: '3',
      example: {
        field: 'outer',
        nested: {
          deeper: 'inner value',
        },
      },
    }

    const encryptedModel = await protectClient.encryptModel<User>(
      decryptedModel,
      users,
    )

    if (encryptedModel.failure) {
      throw new Error(`[protect]: ${encryptedModel.failure.message}`)
    }

    const decryptedResult = await protectClient.decryptModel<User>(
      encryptedModel.data,
    )

    if (decryptedResult.failure) {
      throw new Error(`[protect]: ${decryptedResult.failure.message}`)
    }

    expect(decryptedResult.data).toEqual(decryptedModel)
  }, 30000)

  it('should handle missing optional nested fields', async () => {
    const protectClient = await protect({ schemas: [users] })

    const decryptedModel = {
      id: '5',
      example: {
        field: 'present',
      },
    }

    const encryptedModel = await protectClient.encryptModel<User>(
      decryptedModel,
      users,
    )

    if (encryptedModel.failure) {
      throw new Error(`[protect]: ${encryptedModel.failure.message}`)
    }

    const decryptedResult = await protectClient.decryptModel<User>(
      encryptedModel.data,
    )

    if (decryptedResult.failure) {
      throw new Error(`[protect]: ${decryptedResult.failure.message}`)
    }

    expect(decryptedResult.data).toEqual(decryptedModel)
  }, 30000)
})
