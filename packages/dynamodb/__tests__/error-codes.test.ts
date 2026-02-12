import 'dotenv/config'
import {
  Encryption,
  FfiEncryptionError,
  encryptedColumn,
  encryptedTable,
} from '@cipherstash/stack'
import type { EncryptionClient } from '@cipherstash/stack'
import { beforeAll, describe, expect, it } from 'vitest'
import { encryptedDynamoDB } from '../src'
import type { EncryptedDynamoDBError } from '../src/types'

const FFI_TEST_TIMEOUT = 30_000

describe('EncryptedDynamoDB Error Code Preservation', () => {
  let encryptionClient: EncryptionClient
  let dynamodb: ReturnType<typeof encryptedDynamoDB>

  const testSchema = encryptedTable('test_table', {
    email: encryptedColumn('email').equality(),
  })

  const badSchema = encryptedTable('test_table', {
    nonexistent: encryptedColumn('nonexistent_column'),
  })

  beforeAll(async () => {
    encryptionClient = await Encryption({ schemas: [testSchema] })
    dynamodb = encryptedDynamoDB({ encryptionClient })
  })

  describe('handleError FFI error code extraction', () => {
    it('FfiEncryptionError has code property accessible', () => {
      const ffiError = new FfiEncryptionError({
        code: 'UNKNOWN_COLUMN',
        message: 'Test error',
      })
      expect(ffiError.code).toBe('UNKNOWN_COLUMN')
      expect(ffiError instanceof FfiEncryptionError).toBe(true)
    })
  })

  describe('encryptModel error codes', () => {
    it(
      'preserves FFI error codes',
      async () => {
        const model = { nonexistent: 'test value' }

        const result = await dynamodb.encryptModel(model, badSchema)

        expect(result.failure).toBeDefined()
        expect((result.failure as EncryptedDynamoDBError).code).toBe(
          'UNKNOWN_COLUMN',
        )
      },
      FFI_TEST_TIMEOUT,
    )
  })

  describe('decryptModel error codes', () => {
    it(
      'uses DYNAMODB_ENCRYPTION_ERROR for IO/parsing errors without FFI codes',
      async () => {
        // Malformed ciphertext causes IO/parsing errors that don't have FFI error codes
        const malformedItem = {
          email__source: 'invalid_ciphertext_data',
        }

        const result = await dynamodb.decryptModel(malformedItem, testSchema)

        expect(result.failure).toBeDefined()
        // FFI returns undefined code for IO/parsing errors, so we fall back to generic code
        expect((result.failure as EncryptedDynamoDBError).code).toBe(
          'DYNAMODB_ENCRYPTION_ERROR',
        )
      },
      FFI_TEST_TIMEOUT,
    )
  })

  describe('bulkEncryptModels error codes', () => {
    it(
      'preserves FFI error codes',
      async () => {
        const models = [{ nonexistent: 'value1' }, { nonexistent: 'value2' }]

        const result = await dynamodb.bulkEncryptModels(models, badSchema)

        expect(result.failure).toBeDefined()
        expect((result.failure as EncryptedDynamoDBError).code).toBe(
          'UNKNOWN_COLUMN',
        )
      },
      FFI_TEST_TIMEOUT,
    )
  })

  describe('bulkDecryptModels error codes', () => {
    it(
      'uses DYNAMODB_ENCRYPTION_ERROR for IO/parsing errors without FFI codes',
      async () => {
        // Malformed ciphertext causes IO/parsing errors that don't have FFI error codes
        const malformedItems = [
          { email__source: 'invalid1' },
          { email__source: 'invalid2' },
        ]

        const result = await dynamodb.bulkDecryptModels(
          malformedItems,
          testSchema,
        )

        expect(result.failure).toBeDefined()
        // FFI returns undefined code for IO/parsing errors, so we fall back to generic code
        expect((result.failure as EncryptedDynamoDBError).code).toBe(
          'DYNAMODB_ENCRYPTION_ERROR',
        )
      },
      FFI_TEST_TIMEOUT,
    )
  })
})
