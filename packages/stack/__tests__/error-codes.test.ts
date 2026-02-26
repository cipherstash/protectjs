import 'dotenv/config'
import type { EncryptionClient } from '@/encryption'
import { Encryption } from '@/index'
import { EncryptionErrorTypes } from '@/errors'
import { defineContract, encrypted } from '@/contract'
import { ProtectError as FfiProtectError } from '@cipherstash/protect-ffi'
import { beforeAll, describe, expect, it } from 'vitest'

/** FFI tests require longer timeout due to client initialization */
const FFI_TEST_TIMEOUT = 30_000

/**
 * Tests for FFI error code preservation in ProtectError.
 * These tests verify that specific FFI error codes are preserved when errors occur,
 * enabling programmatic error handling.
 */
describe('FFI Error Code Preservation', () => {
  let protectClient: EncryptionClient

  // Contract with valid columns for testing
  const contract = defineContract({
    test_table: {
      email: encrypted({ type: 'string', equality: true }),
      bio: encrypted({ type: 'string', freeTextSearch: true }),
      age: encrypted({ type: 'number', orderAndRange: true }),
      metadata: encrypted({ type: 'json', searchableJson: true }),
    },
    no_index_table: {
      raw: encrypted({ type: 'string' }),
    },
  })

  // Separate contract for triggering UNKNOWN_COLUMN errors
  // The key must match the model's field name so encryptModel picks it up,
  // but the column won't exist in the client's schema → UNKNOWN_COLUMN
  const badContract = defineContract({
    test_table: {
      nonexistent: encrypted({ type: 'string' }),
    },
  })

  // Separate contract for fake columns used in error tests
  const fakeColumnContract = defineContract({
    test_table: {
      nonexistent_column: encrypted({ type: 'string', equality: true }),
    },
  })

  beforeAll(async () => {
    protectClient = await Encryption({ contract })
  })

  describe('FfiProtectError class', () => {
    it('constructs with code and message', () => {
      const error = new FfiProtectError({
        code: 'UNKNOWN_COLUMN',
        message: 'Test error',
      })
      expect(error.code).toBe('UNKNOWN_COLUMN')
      expect(error.message).toBe('Test error')
    })
  })

  describe('encryptQuery error codes', () => {
    it(
      'returns UNKNOWN_COLUMN code for non-existent column',
      async () => {
        const result = await protectClient.encryptQuery('test', {
          contract: fakeColumnContract.test_table.nonexistent_column,
          queryType: 'equality',
        })

        expect(result.failure).toBeDefined()
        expect(result.failure?.type).toBe(EncryptionErrorTypes.EncryptionError)
        expect(result.failure?.code).toBe('UNKNOWN_COLUMN')
      },
      FFI_TEST_TIMEOUT,
    )

    it(
      'returns undefined code for columns without indexes (non-FFI validation)',
      async () => {
        // This error is caught during pre-FFI validation, not by FFI itself
        const result = await protectClient.encryptQuery('test', {
          contract: contract.no_index_table.raw,
        })

        expect(result.failure).toBeDefined()
        expect(result.failure?.type).toBe(EncryptionErrorTypes.EncryptionError)
        expect(result.failure?.message).toContain('no indexes configured')
        // Pre-FFI validation errors don't have FFI error codes
        expect(result.failure?.code).toBeUndefined()
      },
      FFI_TEST_TIMEOUT,
    )

    it(
      'returns undefined code for non-FFI validation errors',
      async () => {
        // NaN validation happens before FFI call
        const result = await protectClient.encryptQuery(Number.NaN, {
          contract: contract.test_table.age,
          queryType: 'orderAndRange',
        })

        expect(result.failure).toBeDefined()
        expect(result.failure?.type).toBe(EncryptionErrorTypes.EncryptionError)
        // Non-FFI errors should have undefined code
        expect(result.failure?.code).toBeUndefined()
      },
      FFI_TEST_TIMEOUT,
    )
  })

  describe('batch encryptQuery error codes', () => {
    it(
      'preserves error code in batch operations',
      async () => {
        const result = await protectClient.encryptQuery([
          {
            value: 'test',
            contract: fakeColumnContract.test_table.nonexistent_column,
            queryType: 'equality',
          },
        ])

        expect(result.failure).toBeDefined()
        expect(result.failure?.type).toBe(EncryptionErrorTypes.EncryptionError)
        expect(result.failure?.code).toBe('UNKNOWN_COLUMN')
      },
      FFI_TEST_TIMEOUT,
    )

    it(
      'returns undefined code for non-FFI batch errors',
      async () => {
        const result = await protectClient.encryptQuery([
          {
            value: Number.NaN,
            contract: contract.test_table.age,
            queryType: 'orderAndRange',
          },
        ])

        expect(result.failure).toBeDefined()
        expect(result.failure?.code).toBeUndefined()
      },
      FFI_TEST_TIMEOUT,
    )
  })

  describe('encrypt error codes', () => {
    it(
      'returns UNKNOWN_COLUMN code for non-existent column in encrypt',
      async () => {
        const result = await protectClient.encrypt('test', {
          contract: fakeColumnContract.test_table.nonexistent_column,
        })

        expect(result.failure).toBeDefined()
        expect(result.failure?.type).toBe(EncryptionErrorTypes.EncryptionError)
        expect(result.failure?.code).toBe('UNKNOWN_COLUMN')
      },
      FFI_TEST_TIMEOUT,
    )

    it(
      'returns undefined code for non-FFI encrypt errors',
      async () => {
        const result = await protectClient.encrypt(Number.NaN, {
          contract: contract.test_table.age,
        })

        expect(result.failure).toBeDefined()
        expect(result.failure?.type).toBe(EncryptionErrorTypes.EncryptionError)
        // NaN validation happens before FFI call
        expect(result.failure?.code).toBeUndefined()
      },
      FFI_TEST_TIMEOUT,
    )
  })

  describe('decrypt error codes', () => {
    it(
      'returns undefined code for malformed ciphertext (non-FFI validation)',
      async () => {
        // This error occurs during ciphertext parsing, not FFI decryption
        const invalidCiphertext = {
          i: { t: 'test_table', c: 'nonexistent' },
          v: 2,
          c: 'invalid_ciphertext_data',
        }

        const result = await protectClient.decrypt(invalidCiphertext)

        expect(result.failure).toBeDefined()
        expect(result.failure?.type).toBe(EncryptionErrorTypes.DecryptionError)
        // Malformed ciphertext errors are caught before FFI and don't have codes
        expect(result.failure?.code).toBeUndefined()
      },
      FFI_TEST_TIMEOUT,
    )
  })

  describe('bulkEncrypt error codes', () => {
    it(
      'returns UNKNOWN_COLUMN code for non-existent column',
      async () => {
        const result = await protectClient.bulkEncrypt(
          [{ plaintext: 'test1' }, { plaintext: 'test2' }],
          {
            contract: fakeColumnContract.test_table.nonexistent_column,
          },
        )

        expect(result.failure).toBeDefined()
        expect(result.failure?.type).toBe(EncryptionErrorTypes.EncryptionError)
        expect(result.failure?.code).toBe('UNKNOWN_COLUMN')
      },
      FFI_TEST_TIMEOUT,
    )

    it(
      'returns undefined code for non-FFI validation errors',
      async () => {
        const result = await protectClient.bulkEncrypt(
          [{ plaintext: Number.NaN }],
          {
            contract: contract.test_table.age,
          },
        )

        expect(result.failure).toBeDefined()
        expect(result.failure?.code).toBeUndefined()
      },
      FFI_TEST_TIMEOUT,
    )
  })

  describe('bulkDecrypt error codes', () => {
    it(
      'returns undefined code for malformed ciphertexts (non-FFI validation)',
      async () => {
        // bulkDecrypt uses the "fallible" FFI API (decryptBulkFallible) which normally:
        // - Succeeds at the operation level
        // - Returns per-item results with either { data } or { error }
        //
        // However, malformed ciphertexts cause parsing errors BEFORE the fallible API,
        // which throws and triggers a top-level failure (not per-item errors).
        // These pre-FFI errors don't have structured FFI error codes.
        const invalidCiphertexts = [
          { data: { i: { t: 'test_table', c: 'email' }, v: 2, c: 'invalid1' } },
          { data: { i: { t: 'test_table', c: 'email' }, v: 2, c: 'invalid2' } },
        ]

        const result = await protectClient.bulkDecrypt(invalidCiphertexts)

        expect(result.failure).toBeDefined()
        expect(result.failure?.type).toBe(EncryptionErrorTypes.DecryptionError)
        // FFI parsing errors don't have structured error codes
        expect(result.failure?.code).toBeUndefined()
      },
      FFI_TEST_TIMEOUT,
    )
  })

  describe('encryptModel error codes', () => {
    it(
      'returns UNKNOWN_COLUMN code for model with non-existent column',
      async () => {
        const model = { nonexistent: 'test value' }

        const result = await protectClient.encryptModel(model, badContract.test_table)

        expect(result.failure).toBeDefined()
        expect(result.failure?.type).toBe(EncryptionErrorTypes.EncryptionError)
        expect(result.failure?.code).toBe('UNKNOWN_COLUMN')
      },
      FFI_TEST_TIMEOUT,
    )
  })

  describe('decryptModel error codes', () => {
    it(
      'returns undefined code for malformed model (non-FFI validation)',
      async () => {
        const malformedModel = {
          email: {
            i: { t: 'test_table', c: 'email' },
            v: 2,
            c: 'invalid_ciphertext',
          },
        }

        const result = await protectClient.decryptModel(malformedModel)

        expect(result.failure).toBeDefined()
        expect(result.failure?.type).toBe(EncryptionErrorTypes.DecryptionError)
        expect(result.failure?.code).toBeUndefined()
      },
      FFI_TEST_TIMEOUT,
    )
  })

  describe('bulkEncryptModels error codes', () => {
    it(
      'returns UNKNOWN_COLUMN code for models with non-existent column',
      async () => {
        const models = [{ nonexistent: 'value1' }, { nonexistent: 'value2' }]

        const result = await protectClient.bulkEncryptModels(
          models,
          badContract.test_table,
        )

        expect(result.failure).toBeDefined()
        expect(result.failure?.type).toBe(EncryptionErrorTypes.EncryptionError)
        expect(result.failure?.code).toBe('UNKNOWN_COLUMN')
      },
      FFI_TEST_TIMEOUT,
    )
  })

  describe('bulkDecryptModels error codes', () => {
    it(
      'returns undefined code for malformed models (non-FFI validation)',
      async () => {
        const malformedModels = [
          {
            email: { i: { t: 'test_table', c: 'email' }, v: 2, c: 'invalid1' },
          },
          {
            email: { i: { t: 'test_table', c: 'email' }, v: 2, c: 'invalid2' },
          },
        ]

        const result = await protectClient.bulkDecryptModels(malformedModels)

        expect(result.failure).toBeDefined()
        expect(result.failure?.type).toBe(EncryptionErrorTypes.DecryptionError)
        expect(result.failure?.code).toBeUndefined()
      },
      FFI_TEST_TIMEOUT,
    )
  })
})
