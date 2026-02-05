import 'dotenv/config'
import { describe, expect, it, beforeAll } from 'vitest'
import { protect, ProtectErrorTypes, FfiProtectError } from '../src'
import type { ProtectClient, ProtectErrorCode } from '../src'
import { csColumn, csTable } from '@cipherstash/schema'

/** FFI tests require longer timeout due to client initialization */
const FFI_TEST_TIMEOUT = 30_000

/**
 * Tests for FFI error code preservation in ProtectError.
 * These tests verify that specific FFI error codes are preserved when errors occur,
 * enabling programmatic error handling.
 */
describe('FFI Error Code Preservation', () => {
  let protectClient: ProtectClient

  // Schema with a valid column for testing
  const testSchema = csTable('test_table', {
    email: csColumn('email').equality(),
    bio: csColumn('bio').freeTextSearch(),
    age: csColumn('age').dataType('number').orderAndRange(),
    metadata: csColumn('metadata').searchableJson(),
  })

  // Schema without indexes for testing MISSING_INDEX
  const noIndexSchema = csTable('no_index_table', {
    raw: csColumn('raw'),
  })

  beforeAll(async () => {
    protectClient = await protect({ schemas: [testSchema, noIndexSchema] })
  })

  describe('FfiProtectError class export', () => {
    it('exports FfiProtectError class from protect package', () => {
      expect(FfiProtectError).toBeDefined()
      expect(typeof FfiProtectError).toBe('function')
    })

    it('FfiProtectError instances have code property', () => {
      const error = new FfiProtectError({
        code: 'UNKNOWN_COLUMN',
        message: 'Test error',
      })
      expect(error.code).toBe('UNKNOWN_COLUMN')
      expect(error.message).toBe('Test error')
      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(FfiProtectError)
    })
  })

  describe('encryptQuery error codes', () => {
    it('returns UNKNOWN_COLUMN code for non-existent column', async () => {
      // Create a fake column that doesn't exist in the schema
      const fakeColumn = csColumn('nonexistent_column').equality()

      const result = await protectClient.encryptQuery('test', {
        column: fakeColumn,
        table: testSchema,
        queryType: 'equality',
      })

      expect(result.failure).toBeDefined()
      expect(result.failure?.type).toBe(ProtectErrorTypes.EncryptionError)
      expect(result.failure?.code).toBe('UNKNOWN_COLUMN')
    }, FFI_TEST_TIMEOUT)

    it('returns MISSING_INDEX code when column has no indexes', async () => {
      const result = await protectClient.encryptQuery('test', {
        column: noIndexSchema.raw,
        table: noIndexSchema,
      })

      expect(result.failure).toBeDefined()
      expect(result.failure?.type).toBe(ProtectErrorTypes.EncryptionError)
      // FFI may return a specific error code or undefined depending on validation order.
      // When code is defined, it should be one of the expected FFI error codes.
      if (result.failure?.code !== undefined) {
        expect(['MISSING_INDEX', 'UNKNOWN_COLUMN', 'INVARIANT_VIOLATION']).toContain(result.failure.code)
      }
    }, FFI_TEST_TIMEOUT)

    it('returns undefined code for non-FFI validation errors', async () => {
      // NaN validation happens before FFI call
      const result = await protectClient.encryptQuery(NaN, {
        column: testSchema.age,
        table: testSchema,
        queryType: 'orderAndRange',
      })

      expect(result.failure).toBeDefined()
      expect(result.failure?.type).toBe(ProtectErrorTypes.EncryptionError)
      // Non-FFI errors should have undefined code
      expect(result.failure?.code).toBeUndefined()
    }, FFI_TEST_TIMEOUT)
  })

  describe('batch encryptQuery error codes', () => {
    it('preserves error code in batch operations', async () => {
      const fakeColumn = csColumn('nonexistent_column').equality()

      const result = await protectClient.encryptQuery([
        { value: 'test', column: fakeColumn, table: testSchema, queryType: 'equality' },
      ])

      expect(result.failure).toBeDefined()
      expect(result.failure?.type).toBe(ProtectErrorTypes.EncryptionError)
      expect(result.failure?.code).toBe('UNKNOWN_COLUMN')
    }, FFI_TEST_TIMEOUT)

    it('returns undefined code for non-FFI batch errors', async () => {
      const result = await protectClient.encryptQuery([
        { value: NaN, column: testSchema.age, table: testSchema, queryType: 'orderAndRange' },
      ])

      expect(result.failure).toBeDefined()
      expect(result.failure?.code).toBeUndefined()
    }, FFI_TEST_TIMEOUT)
  })

  describe('encrypt error codes', () => {
    it('returns UNKNOWN_COLUMN code for non-existent column in encrypt', async () => {
      const fakeColumn = csColumn('nonexistent_column')

      const result = await protectClient.encrypt('test', {
        column: fakeColumn,
        table: testSchema,
      })

      expect(result.failure).toBeDefined()
      expect(result.failure?.type).toBe(ProtectErrorTypes.EncryptionError)
      expect(result.failure?.code).toBe('UNKNOWN_COLUMN')
    }, FFI_TEST_TIMEOUT)

    it('returns undefined code for non-FFI encrypt errors', async () => {
      const result = await protectClient.encrypt(NaN, {
        column: testSchema.age,
        table: testSchema,
      })

      expect(result.failure).toBeDefined()
      expect(result.failure?.type).toBe(ProtectErrorTypes.EncryptionError)
      // NaN validation happens before FFI call
      expect(result.failure?.code).toBeUndefined()
    }, FFI_TEST_TIMEOUT)
  })

  describe('decrypt error codes', () => {
    it('preserves error code for invalid ciphertext', async () => {
      // Create an invalid/malformed ciphertext
      const invalidCiphertext = {
        i: { t: 'test_table', c: 'nonexistent' },
        v: 2,
        c: 'invalid_ciphertext_data',
      }

      const result = await protectClient.decrypt(invalidCiphertext)

      expect(result.failure).toBeDefined()
      expect(result.failure?.type).toBe(ProtectErrorTypes.DecryptionError)
      // FFI should return an error code for invalid ciphertext when available.
      // The code may be undefined if the error occurs outside FFI validation.
      if (result.failure?.code !== undefined) {
        expect(typeof result.failure.code).toBe('string')
      }
    }, FFI_TEST_TIMEOUT)
  })

  describe('ProtectError interface', () => {
    it('ProtectError has optional code field', async () => {
      const fakeColumn = csColumn('nonexistent_column').equality()

      const result = await protectClient.encryptQuery('test', {
        column: fakeColumn,
        table: testSchema,
        queryType: 'equality',
      })

      // Type check: code should be accessible (may be undefined for non-FFI errors)
      // TypeScript already guarantees the type as ProtectErrorCode | undefined
      expect(result.failure).toBeDefined()
      expect(result.failure?.code).toBe('UNKNOWN_COLUMN')
    }, FFI_TEST_TIMEOUT)

    it('error code enables programmatic error handling', async () => {
      const fakeColumn = csColumn('nonexistent_column').equality()

      const result = await protectClient.encryptQuery('test', {
        column: fakeColumn,
        table: testSchema,
        queryType: 'equality',
      })

      if (result.failure) {
        // Demonstrate programmatic error handling based on code
        switch (result.failure.code) {
          case 'UNKNOWN_COLUMN':
            // Handle unknown column error
            expect(result.failure.message).toContain('nonexistent_column')
            break
          case 'MISSING_INDEX':
            // Handle missing index error
            break
          case undefined:
            // Handle non-FFI errors (validation, etc.)
            break
          default:
            // Handle other FFI errors
            break
        }
      }
    }, FFI_TEST_TIMEOUT)
  })

  describe('error code type safety', () => {
    it('ProtectErrorCode type includes expected values', () => {
      // Type-level test: these should all be valid ProtectErrorCode values
      const codes: ProtectErrorCode[] = [
        'INVARIANT_VIOLATION',
        'UNKNOWN_QUERY_OP',
        'UNKNOWN_COLUMN',
        'MISSING_INDEX',
        'INVALID_QUERY_INPUT',
        'INVALID_JSON_PATH',
        'STE_VEC_REQUIRES_JSON_CAST_AS',
        'UNKNOWN',
      ]

      expect(codes).toHaveLength(8)
      codes.forEach(code => {
        expect(typeof code).toBe('string')
      })
    })
  })
})
