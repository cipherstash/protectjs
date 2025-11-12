import { describe, it, expect } from 'vitest'
import {
  toComposite,
  fromComposite,
  bulkToComposite,
  bulkFromComposite,
} from '../src/composite-type'

describe('Composite Type Utilities', () => {
  const mockEncrypted = {
    c: 'encrypted_ciphertext_data',
    k: 'key_data',
    i: 'iv_data',
  }

  // Correct format: PostgreSQL uses doubled quotes "" not backslash \"
  const mockCompositeString = '("{""c"":""encrypted_ciphertext_data"",""k"":""key_data"",""i"":""iv_data""}")'

  describe('toComposite', () => {
    it('should convert encrypted object to composite type format', () => {
      const result = toComposite(mockEncrypted)

      // Should have composite type format
      expect(result).toMatch(/^\(".*"\)$/)

      // Should be parseable back
      const parsed = fromComposite(result)
      expect(parsed).toEqual(mockEncrypted)
    })

    it('should escape quotes correctly', () => {
      const value = { test: 'value with "quotes"' }
      const composite = toComposite(value)

      // Should contain doubled quotes for escaping
      expect(composite).toContain('""')

      // Should parse back correctly
      const parsed = fromComposite(composite)
      expect(parsed).toEqual(value)
    })

    it('should handle nested objects', () => {
      const nested = {
        c: 'ciphertext',
        metadata: {
          nested: true,
          value: 123,
        },
      }

      const composite = toComposite(nested)
      const parsed = fromComposite(composite)

      expect(parsed).toEqual(nested)
    })

    it('should handle arrays', () => {
      const array = { data: [1, 2, 3, 'test'] }
      const composite = toComposite(array)
      const parsed = fromComposite(composite)

      expect(parsed).toEqual(array)
    })
  })

  describe('fromComposite', () => {
    it('should parse composite type format to object', () => {
      const result = fromComposite(mockCompositeString)
      expect(result).toEqual(mockEncrypted)
    })

    it('should handle empty string', () => {
      expect(fromComposite('')).toBeNull()
    })

    it('should handle null-like values', () => {
      expect(fromComposite(null as any)).toBeNull()
      expect(fromComposite(undefined as any)).toBeNull()
    })

    it('should parse direct JSON if not in composite format', () => {
      const directJson = '{"c":"test"}'
      const result = fromComposite(directJson)
      expect(result).toEqual({ c: 'test' })
    })

    it('should return value as-is if not parseable', () => {
      // Non-composite, non-JSON format just returns the value
      const result = fromComposite('invalid')
      expect(result).toBe('invalid')
    })

    it('should throw on malformed JSON in composite format', () => {
      // Malformed JSON inside composite format should throw
      const malformed = '("{invalid json}")'
      expect(() => fromComposite(malformed)).toThrow('Failed to parse')
    })

    it('should handle composite format with escaped quotes', () => {
      // PostgreSQL returns: ("{""key"":""value""}")
      const postgresFormat = '("{""key"":""value""}")'
      const result = fromComposite(postgresFormat)
      expect(result).toEqual({ key: 'value' })
    })
  })

  describe('bulkToComposite', () => {
    it('should convert array of encrypted values to composite format', () => {
      const values = [
        { c: 'cipher1', k: 'key1' },
        { c: 'cipher2', k: 'key2' },
        { c: 'cipher3', k: 'key3' },
      ]

      const results = bulkToComposite(values)

      expect(results).toHaveLength(3)
      results.forEach((result, i) => {
        expect(result).toMatch(/^\(".*"\)$/)
        expect(fromComposite(result)).toEqual(values[i])
      })
    })

    it('should handle empty array', () => {
      const results = bulkToComposite([])
      expect(results).toEqual([])
    })

    it('should work with Op.in queries', () => {
      const emailValues = ['alice@example.com', 'bob@example.com']

      // Simulate encrypted values
      const encrypted = emailValues.map((email, i) => ({
        c: `encrypted_${email}`,
        k: `key_${i}`,
      }))

      const composite = bulkToComposite(encrypted)

      // Should be array of composite strings
      expect(Array.isArray(composite)).toBe(true)
      expect(composite).toHaveLength(2)

      // Each should be properly formatted
      composite.forEach((str) => {
        expect(typeof str).toBe('string')
        expect(str).toMatch(/^\(".*"\)$/)
      })
    })
  })

  describe('Round-trip conversion', () => {
    it('should preserve data through toComposite/fromComposite cycle', () => {
      const testCases = [
        { c: 'simple' },
        { c: 'with spaces' },
        { c: 'with "quotes"' },
        { c: "with 'single quotes'" },
        { c: 'with\nnewlines' },
        { c: 'unicode: 你好 🎉' },
        {
          c: 'complex',
          nested: {
            deep: {
              value: 123,
              array: [1, 2, 3],
            },
          },
        },
      ]

      testCases.forEach((testCase) => {
        const composite = toComposite(testCase)
        const parsed = fromComposite(composite)
        expect(parsed).toEqual(testCase)
      })
    })

    it('should work with real encrypted data structure', () => {
      // Simulated structure from protectClient.encrypt()
      const realEncrypted = {
        c: 'mBbJ+v<WeN7v|fc<<?ZIuG2=u',
        k: 'AwEAAQ...key_data',
        i: 'iv_data_here',
        t: ['token1', 'token2'],
        m: {
          type: 'string',
          indexed: true,
        },
      }

      const composite = toComposite(realEncrypted)
      expect(composite).toMatch(/^\(".*"\)$/)

      const parsed = fromComposite(composite)
      expect(parsed).toEqual(realEncrypted)
    })
  })

  describe('Integration example', () => {
    it('should work for manual WHERE clause building', () => {
      // Simulate: const encrypted = await protectClient.encrypt(1000.00, {...})
      const encryptedAmount = {
        c: 'encrypted_1000.00',
        k: 'key_data',
        t: ['range_token_1', 'range_token_2'],
      }

      // Convert to composite format for WHERE clause
      const composite = toComposite(encryptedAmount)

      // Should be usable in Sequelize query
      expect(typeof composite).toBe('string')
      expect(composite).toMatch(/^\(".*"\)$/)

      // Can be parsed back by database/hooks
      const parsed = fromComposite(composite)
      expect(parsed).toEqual(encryptedAmount)
    })

    it('should work for Op.in with multiple values', () => {
      // Simulate encrypting multiple emails
      const emails = ['alice@example.com', 'bob@example.com', 'charlie@example.com']
      const encryptedEmails = emails.map((email) => ({
        c: `encrypted_${email}`,
        t: [`token_${email}`],
      }))

      // Bulk convert to composite format for Op.in
      const composite = bulkToComposite(encryptedEmails)

      // Should be array of composite strings
      expect(Array.isArray(composite)).toBe(true)
      expect(composite).toHaveLength(3)

      // Each should be properly formatted
      composite.forEach((str, i) => {
        expect(str).toMatch(/^\(".*"\)$/)
        const parsed = fromComposite(str)
        expect(parsed).toEqual(encryptedEmails[i])
      })
    })
  })
})
