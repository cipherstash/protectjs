import { describe, expect, it } from 'vitest'
import {
  encryptedToPgComposite,
  modelToEncryptedPgComposites,
  bulkModelsToEncryptedPgComposites,
  isEncryptedPayload,
} from '../src/helpers'

describe('helpers', () => {
  describe('encryptedToPgComposite', () => {
    it('should convert encrypted payload to pg composite', () => {
      const encrypted = {
        v: 1,
        c: 'ciphertext',
        i: {
          c: 'iv',
          t: 't',
        },
        k: 'k',
        ob: ['a', 'b'],
        bf: [1, 2, 3],
        hm: 'hm',
      }

      const pgComposite = encryptedToPgComposite(encrypted)
      expect(pgComposite).toEqual({
        data: encrypted,
      })
    })
  })

  describe('isEncryptedPayload', () => {
    it('should return true for valid encrypted payload', () => {
      const encrypted = {
        v: 1,
        c: 'ciphertext',
        i: { c: 'iv', t: 't' },
      }
      expect(isEncryptedPayload(encrypted)).toBe(true)
    })

    it('should return false for null', () => {
      expect(isEncryptedPayload(null)).toBe(false)
    })

    it('should return false for non-encrypted object', () => {
      expect(isEncryptedPayload({ foo: 'bar' })).toBe(false)
    })
  })

  describe('modelToEncryptedPgComposites', () => {
    it('should transform model with encrypted fields', () => {
      const model = {
        name: 'John',
        email: {
          v: 1,
          c: 'encrypted_email',
          i: { c: 'iv', t: 't' },
        },
        age: 30,
      }

      const result = modelToEncryptedPgComposites(model)
      expect(result).toEqual({
        name: 'John',
        email: {
          data: {
            v: 1,
            c: 'encrypted_email',
            i: { c: 'iv', t: 't' },
          },
        },
        age: 30,
      })
    })
  })

  describe('bulkModelsToEncryptedPgComposites', () => {
    it('should transform multiple models with encrypted fields', () => {
      const models = [
        {
          name: 'John',
          email: {
            v: 1,
            c: 'encrypted_email1',
            i: { c: 'iv', t: 't' },
          },
        },
        {
          name: 'Jane',
          email: {
            v: 1,
            c: 'encrypted_email2',
            i: { c: 'iv', t: 't' },
          },
        },
      ]

      const result = bulkModelsToEncryptedPgComposites(models)
      expect(result).toEqual([
        {
          name: 'John',
          email: {
            data: {
              v: 1,
              c: 'encrypted_email1',
              i: { c: 'iv', t: 't' },
            },
          },
        },
        {
          name: 'Jane',
          email: {
            data: {
              v: 1,
              c: 'encrypted_email2',
              i: { c: 'iv', t: 't' },
            },
          },
        },
      ])
    })
  })
})
