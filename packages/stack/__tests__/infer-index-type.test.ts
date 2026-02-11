import { encryptedColumn, encryptedTable } from '@cipherstash/schema'
import { describe, expect, it } from 'vitest'
import {
  inferIndexType,
  validateIndexType,
} from '../src/ffi/helpers/infer-index-type'

describe('infer-index-type helpers', () => {
  const users = encryptedTable('users', {
    email: encryptedColumn('email').equality(),
    bio: encryptedColumn('bio').freeTextSearch(),
    age: encryptedColumn('age').orderAndRange(),
    name: encryptedColumn('name').equality().freeTextSearch(),
  })

  describe('inferIndexType', () => {
    it('returns unique for equality-only column', () => {
      expect(inferIndexType(users.email)).toBe('unique')
    })

    it('returns match for freeTextSearch-only column', () => {
      expect(inferIndexType(users.bio)).toBe('match')
    })

    it('returns ore for orderAndRange-only column', () => {
      expect(inferIndexType(users.age)).toBe('ore')
    })

    it('returns unique when multiple indexes (priority: unique > match > ore)', () => {
      expect(inferIndexType(users.name)).toBe('unique')
    })

    it('returns match when freeTextSearch and orderAndRange (priority: match > ore)', () => {
      const schema = encryptedTable('t', {
        col: encryptedColumn('col').freeTextSearch().orderAndRange(),
      })
      expect(inferIndexType(schema.col)).toBe('match')
    })

    it('throws for column with no indexes', () => {
      const noIndex = encryptedTable('t', { col: encryptedColumn('col') })
      expect(() => inferIndexType(noIndex.col)).toThrow('no indexes configured')
    })
  })

  describe('validateIndexType', () => {
    it('does not throw for valid index type', () => {
      expect(() => validateIndexType(users.email, 'unique')).not.toThrow()
    })

    it('throws for unconfigured index type', () => {
      expect(() => validateIndexType(users.email, 'match')).toThrow(
        'not configured',
      )
    })
  })
})
