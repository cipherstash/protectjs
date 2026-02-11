import 'dotenv/config'
import {
  Encryption,
  encryptedColumn,
  encryptedTable,
  encryptedValue,
} from '@cipherstash/stack'
import { beforeAll, describe, expect, it } from 'vitest'
import { protectDynamoDB } from '../src'

const schema = encryptedTable('dynamo_cipherstash_test', {
  email: encryptedColumn('email').equality(),
  firstName: encryptedColumn('firstName').equality(),
  lastName: encryptedColumn('lastName').equality(),
  phoneNumber: encryptedColumn('phoneNumber'),
  json: encryptedColumn('json').dataType('json'),
  jsonSearchable: encryptedColumn('jsonSearchable').dataType('json'),
  //.searchableJson('users/jsonSearchable'),
  example: {
    protected: encryptedValue('example.protected'),
    deep: {
      protected: encryptedValue('example.deep.protected'),
      protectNestedJson: encryptedValue(
        'example.deep.protectNestedJson',
      ).dataType('json'),
    },
  },
})

describe('protect dynamodb helpers', () => {
  let protectClient: Awaited<ReturnType<typeof Encryption>>
  let protectDynamo: ReturnType<typeof protectDynamoDB>

  beforeAll(async () => {
    protectClient = await Encryption({
      schemas: [schema],
    })

    protectDynamo = protectDynamoDB({
      protectClient,
    })
  })

  it('should encrypt and decrypt a model', async () => {
    const testData = {
      id: '01ABCDEFGHIJKLMNOPQRSTUVWX',
      email: 'test.user@example.com',
      address: '123 Main Street',
      createdAt: '2024-08-15T22:14:49.948Z',
      firstName: 'John',
      lastName: 'Smith',
      phoneNumber: '555-555-5555',
      json: {
        name: 'John Doe',
        age: 30,
        preferences: {
          theme: 'dark',
          notifications: true,
        },
      },
      jsonSearchable: {
        name: 'John Doe',
        age: 30,
        preferences: {
          theme: 'dark',
          notifications: true,
        },
      },
      companyName: 'Acme Corp',
      batteryBrands: ['Brand1', 'Brand2'],
      metadata: { role: 'admin' },
      example: {
        protected: 'hello world',
        notProtected: 'I am not protected',
        deep: {
          protected: 'deep protected',
          notProtected: 'deep not protected',
          protectNestedJson: {
            hello: 'world',
          },
        },
      },
    }

    const result = await protectDynamo.encryptModel(testData, schema)
    if (result.failure) {
      throw new Error(`Encryption failed: ${result.failure.message}`)
    }

    const encryptedData = result.data

    // Verify equality columns are encrypted
    expect(encryptedData).toHaveProperty('email__source')
    expect(encryptedData).toHaveProperty('email__hmac')
    expect(encryptedData).toHaveProperty('firstName__source')
    expect(encryptedData).toHaveProperty('firstName__hmac')
    expect(encryptedData).toHaveProperty('lastName__source')
    expect(encryptedData).toHaveProperty('lastName__hmac')
    expect(encryptedData).toHaveProperty('phoneNumber__source')
    expect(encryptedData).not.toHaveProperty('phoneNumber__hmac')
    expect(encryptedData.example).toHaveProperty('protected__source')
    expect(encryptedData.example.deep).toHaveProperty('protected__source')

    // Verify other fields remain unchanged
    expect(encryptedData.id).toBe('01ABCDEFGHIJKLMNOPQRSTUVWX')
    expect(encryptedData.address).toBe('123 Main Street')
    expect(encryptedData.createdAt).toBe('2024-08-15T22:14:49.948Z')
    expect(encryptedData.companyName).toBe('Acme Corp')
    expect(encryptedData.batteryBrands).toEqual(['Brand1', 'Brand2'])
    expect(encryptedData.example.notProtected).toBe('I am not protected')
    expect(encryptedData.example.deep.notProtected).toBe('deep not protected')
    expect(encryptedData.metadata).toEqual({ role: 'admin' })

    const decryptResult = await protectDynamo.decryptModel(
      encryptedData,
      schema,
    )
    if (decryptResult.failure) {
      throw new Error(`Decryption failed: ${decryptResult.failure.message}`)
    }

    expect(decryptResult.data).toEqual(testData)
  })

  it('should handle null and undefined values', async () => {
    const testData = {
      id: '01ABCDEFGHIJKLMNOPQRSTUVWX',
      email: null,
      firstName: undefined,
      lastName: 'Smith',
      phoneNumber: null,
      metadata: { role: null },
      example: {
        protected: null,
        notProtected: 'I am not protected',
        deep: {
          protected: undefined,
          notProtected: 'deep not protected',
        },
      },
    }

    const result = await protectDynamo.encryptModel(testData, schema)
    if (result.failure) {
      throw new Error(`Encryption failed: ${result.failure.message}`)
    }

    const encryptedData = result.data

    // Verify null/undefined equality columns are handled
    expect(encryptedData).toHaveProperty('lastName__source')
    expect(encryptedData).toHaveProperty('lastName__hmac')

    // Verify other fields remain unchanged
    expect(encryptedData.id).toBe('01ABCDEFGHIJKLMNOPQRSTUVWX')
    expect(encryptedData.phoneNumber).toBeNull()
    expect(encryptedData.email).toBeNull()
    expect(encryptedData.firstName).toBeUndefined()
    expect(encryptedData.metadata).toEqual({ role: null })
    expect(encryptedData.example.protected).toBeNull()
    expect(encryptedData.example.deep.protected).toBeUndefined()
    expect(encryptedData.example.deep.notProtected).toBe('deep not protected')
  })

  it('should handle empty strings and special characters', async () => {
    const testData = {
      id: '01ABCDEFGHIJKLMNOPQRSTUVWX',
      email: '',
      firstName: 'John!@#$%^&*()',
      lastName: 'Smith  ',
      phoneNumber: '',
      metadata: { role: 'admin!@#$%^&*()' },
    }

    const result = await protectDynamo.encryptModel(testData, schema)
    if (result.failure) {
      throw new Error(`Encryption failed: ${result.failure.message}`)
    }

    const encryptedData = result.data

    // Verify equality columns are encrypted
    expect(encryptedData).toHaveProperty('email__source')
    expect(encryptedData).toHaveProperty('email__hmac')
    expect(encryptedData).toHaveProperty('firstName__source')
    expect(encryptedData).toHaveProperty('firstName__hmac')
    expect(encryptedData).toHaveProperty('lastName__source')
    expect(encryptedData).toHaveProperty('lastName__hmac')
    expect(encryptedData).toHaveProperty('phoneNumber__source')
    expect(encryptedData).not.toHaveProperty('phoneNumber__hmac')

    // Verify other fields remain unchanged
    expect(encryptedData.id).toBe('01ABCDEFGHIJKLMNOPQRSTUVWX')
    expect(encryptedData.metadata).toEqual({ role: 'admin!@#$%^&*()' })
  })

  it('should handle bulk encryption', async () => {
    const testData = [
      {
        id: '01ABCDEFGHIJKLMNOPQRSTUVWX',
        email: 'test1@example.com',
        firstName: 'John',
        lastName: 'Smith',
        phoneNumber: '555-555-5555',
      },
      {
        id: '02ABCDEFGHIJKLMNOPQRSTUVWX',
        email: 'test2@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        phoneNumber: '555-555-5556',
      },
    ]

    const result = await protectDynamo.bulkEncryptModels(testData, schema)
    if (result.failure) {
      throw new Error(`Bulk encryption failed: ${result.failure.message}`)
    }

    const encryptedData = result.data

    // Verify both items are encrypted
    expect(encryptedData).toHaveLength(2)

    // Verify first item
    expect(encryptedData[0]).toHaveProperty('email__source')
    expect(encryptedData[0]).toHaveProperty('email__hmac')
    expect(encryptedData[0]).toHaveProperty('firstName__source')
    expect(encryptedData[0]).toHaveProperty('firstName__hmac')
    expect(encryptedData[0]).toHaveProperty('lastName__source')
    expect(encryptedData[0]).toHaveProperty('lastName__hmac')
    expect(encryptedData[0]).toHaveProperty('phoneNumber__source')

    // Verify second item
    expect(encryptedData[1]).toHaveProperty('email__source')
    expect(encryptedData[1]).toHaveProperty('email__hmac')
    expect(encryptedData[1]).toHaveProperty('firstName__source')
    expect(encryptedData[1]).toHaveProperty('firstName__hmac')
    expect(encryptedData[1]).toHaveProperty('lastName__source')
    expect(encryptedData[1]).toHaveProperty('lastName__hmac')
    expect(encryptedData[1]).toHaveProperty('phoneNumber__source')
  })

  it('should handle decryption of encrypted data', async () => {
    const originalData = {
      id: '01ABCDEFGHIJKLMNOPQRSTUVWX',
      email: 'test.user@example.com',
      firstName: 'John',
      lastName: 'Smith',
      phoneNumber: '555-555-5555',
      example: {
        protected: 'hello world',
        notProtected: 'I am not protected',
        deep: {
          protected: 'deep protected',
          notProtected: 'deep not protected',
        },
      },
    }

    // First encrypt
    const encryptResult = await protectDynamo.encryptModel(originalData, schema)

    if (encryptResult.failure) {
      throw new Error(`Encryption failed: ${encryptResult.failure.message}`)
    }

    // Then decrypt
    const decryptResult = await protectDynamo.decryptModel(
      encryptResult.data,
      schema,
    )
    if (decryptResult.failure) {
      throw new Error(`Decryption failed: ${decryptResult.failure.message}`)
    }

    const decryptedData = decryptResult.data

    // Verify all fields match original data
    expect(decryptedData).toEqual(originalData)
  })

  it('should handle decryption of bulk encrypted data', async () => {
    const originalData = [
      {
        id: '01ABCDEFGHIJKLMNOPQRSTUVWX',
        email: 'test1@example.com',
        firstName: 'John',
        lastName: 'Smith',
        phoneNumber: '555-555-5555',
      },
      {
        id: '02ABCDEFGHIJKLMNOPQRSTUVWX',
        email: 'test2@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        phoneNumber: '555-555-5556',
        example: {
          protected: 'hello world',
          notProtected: 'I am not protected',
          deep: {
            protected: 'deep protected',
            notProtected: 'deep not protected',
          },
        },
      },
    ]

    // First encrypt
    const encryptResult = await protectDynamo.bulkEncryptModels(
      originalData,
      schema,
    )
    if (encryptResult.failure) {
      throw new Error(
        `Bulk encryption failed: ${encryptResult.failure.message}`,
      )
    }

    // Then decrypt
    const decryptResult = await protectDynamo.bulkDecryptModels(
      encryptResult.data,
      schema,
    )
    if (decryptResult.failure) {
      throw new Error(
        `Bulk decryption failed: ${decryptResult.failure.message}`,
      )
    }

    const decryptedData = decryptResult.data

    // Verify all items match original data
    expect(decryptedData).toEqual(originalData)
  })
})
