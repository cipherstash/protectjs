import 'dotenv/config'
import { describe, expect, it, beforeAll } from 'vitest'
import {
  protect,
  FfiProtectError,
  csColumn,
  csTable,
} from '@cipherstash/protect'
import type { ProtectClient } from '@cipherstash/protect'
import { protectDynamoDB } from '../src'
import type { ProtectDynamoDBError } from '../src/types'

const FFI_TEST_TIMEOUT = 30_000

describe('ProtectDynamoDB Error Code Preservation', () => {
  let protectClient: ProtectClient
  let protectDynamo: ReturnType<typeof protectDynamoDB>

  const testSchema = csTable('test_table', {
    email: csColumn('email').equality(),
  })

  const badSchema = csTable('test_table', {
    nonexistent: csColumn('nonexistent_column'),
  })

  beforeAll(async () => {
    protectClient = await protect({ schemas: [testSchema] })
    protectDynamo = protectDynamoDB({ protectClient })
  })

  describe('handleError FFI error code extraction', () => {
    it('FfiProtectError has code property accessible', () => {
      const ffiError = new FfiProtectError({
        code: 'UNKNOWN_COLUMN',
        message: 'Test error',
      })
      expect(ffiError.code).toBe('UNKNOWN_COLUMN')
      expect(ffiError instanceof FfiProtectError).toBe(true)
    })
  })

  describe('encryptModel error codes', () => {
    it('uses PROTECT_DYNAMODB_ERROR for encryption failures', async () => {
      // Note: FFI error codes from protectClient.encryptModel are not currently
      // preserved through the DynamoDB layer - the failure result contains the code
      // but it's wrapped in a new Error() which loses the FfiProtectError type
      const model = { nonexistent: 'test value' }

      const result = await protectDynamo.encryptModel(model, badSchema)

      expect(result.failure).toBeDefined()
      expect((result.failure as ProtectDynamoDBError).code).toBe(
        'PROTECT_DYNAMODB_ERROR',
      )
    }, FFI_TEST_TIMEOUT)
  })

  describe('decryptModel error codes', () => {
    it('uses PROTECT_DYNAMODB_ERROR for malformed ciphertext', async () => {
      const malformedItem = {
        email__source: 'invalid_ciphertext_data',
      }

      const result = await protectDynamo.decryptModel(malformedItem, testSchema)

      expect(result.failure).toBeDefined()
      expect((result.failure as ProtectDynamoDBError).code).toBe(
        'PROTECT_DYNAMODB_ERROR',
      )
    }, FFI_TEST_TIMEOUT)
  })

  describe('bulkEncryptModels error codes', () => {
    it('uses PROTECT_DYNAMODB_ERROR for bulk encryption failures', async () => {
      // Note: FFI error codes from protectClient.bulkEncryptModels are not currently
      // preserved through the DynamoDB layer - the failure result contains the code
      // but it's wrapped in a new Error() which loses the FfiProtectError type
      const models = [{ nonexistent: 'value1' }, { nonexistent: 'value2' }]

      const result = await protectDynamo.bulkEncryptModels(models, badSchema)

      expect(result.failure).toBeDefined()
      expect((result.failure as ProtectDynamoDBError).code).toBe(
        'PROTECT_DYNAMODB_ERROR',
      )
    }, FFI_TEST_TIMEOUT)
  })

  describe('bulkDecryptModels error codes', () => {
    it('uses PROTECT_DYNAMODB_ERROR for malformed items', async () => {
      const malformedItems = [
        { email__source: 'invalid1' },
        { email__source: 'invalid2' },
      ]

      const result = await protectDynamo.bulkDecryptModels(
        malformedItems,
        testSchema,
      )

      expect(result.failure).toBeDefined()
      expect((result.failure as ProtectDynamoDBError).code).toBe(
        'PROTECT_DYNAMODB_ERROR',
      )
    }, FFI_TEST_TIMEOUT)
  })
})
