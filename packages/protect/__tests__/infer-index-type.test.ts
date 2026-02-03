import { describe, expect, it } from 'vitest'
import { csColumn, csTable } from '@cipherstash/schema'
import {
  inferIndexType,
  validateIndexType,
  inferQueryOpFromPlaintext,
  resolveIndexType,
} from '../src/ffi/helpers/infer-index-type'

describe('infer-index-type helpers', () => {
  const users = csTable('users', {
    email: csColumn('email').equality(),
    bio: csColumn('bio').freeTextSearch(),
    age: csColumn('age').orderAndRange(),
    name: csColumn('name').equality().freeTextSearch(),
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
      const schema = csTable('t', { col: csColumn('col').freeTextSearch().orderAndRange() })
      expect(inferIndexType(schema.col)).toBe('match')
    })

    it('throws for column with no indexes', () => {
      const noIndex = csTable('t', { col: csColumn('col') })
      expect(() => inferIndexType(noIndex.col)).toThrow('no indexes configured')
    })

    it('returns ste_vec for searchableJson-only column', () => {
      const schema = csTable('t', { col: csColumn('col').searchableJson() })
      expect(inferIndexType(schema.col)).toBe('ste_vec')
    })
  })

  describe('validateIndexType', () => {
    it('does not throw for valid index type', () => {
      expect(() => validateIndexType(users.email, 'unique')).not.toThrow()
    })

    it('throws for unconfigured index type', () => {
      expect(() => validateIndexType(users.email, 'match')).toThrow('not configured')
    })

    it('accepts ste_vec when configured', () => {
      const schema = csTable('t', { col: csColumn('col').searchableJson() })
      expect(() => validateIndexType(schema.col, 'ste_vec')).not.toThrow()
    })

    it('rejects ste_vec when not configured', () => {
      const schema = csTable('t', { col: csColumn('col').equality() })
      expect(() => validateIndexType(schema.col, 'ste_vec')).toThrow('not configured')
    })
  })

  describe('inferQueryOpFromPlaintext', () => {
    it('returns ste_vec_selector for string plaintext', () => {
      expect(inferQueryOpFromPlaintext('$.user.email')).toBe('ste_vec_selector')
    })

    it('returns ste_vec_term for object plaintext', () => {
      expect(inferQueryOpFromPlaintext({ role: 'admin' })).toBe('ste_vec_term')
    })

    it('returns ste_vec_term for array plaintext', () => {
      expect(inferQueryOpFromPlaintext(['admin', 'user'])).toBe('ste_vec_term')
    })

    it('throws for number plaintext', () => {
      expect(() => inferQueryOpFromPlaintext(42)).toThrow('Cannot infer STE Vec query operation')
    })

    it('throws for boolean plaintext', () => {
      expect(() => inferQueryOpFromPlaintext(true)).toThrow('Cannot infer STE Vec query operation')
    })
  })

  describe('resolveIndexType with plaintext inference', () => {
    it('infers ste_vec_selector for string on searchableJson column', () => {
      const schema = csTable('t', { col: csColumn('col').searchableJson() })
      const result = resolveIndexType(schema.col, undefined, '$.user.email')
      expect(result).toEqual({ indexType: 'ste_vec', queryOp: 'ste_vec_selector' })
    })

    it('infers ste_vec_term for object on searchableJson column', () => {
      const schema = csTable('t', { col: csColumn('col').searchableJson() })
      const result = resolveIndexType(schema.col, undefined, { role: 'admin' })
      expect(result).toEqual({ indexType: 'ste_vec', queryOp: 'ste_vec_term' })
    })

    it('infers ste_vec_term for array on searchableJson column', () => {
      const schema = csTable('t', { col: csColumn('col').searchableJson() })
      const result = resolveIndexType(schema.col, undefined, ['admin'])
      expect(result).toEqual({ indexType: 'ste_vec', queryOp: 'ste_vec_term' })
    })

    it('throws when ste_vec inferred but plaintext is null', () => {
      const schema = csTable('t', { col: csColumn('col').searchableJson() })
      expect(() => resolveIndexType(schema.col, undefined, null)).toThrow(
        'Cannot infer query operation for searchableJson column'
      )
    })

    it('throws when ste_vec inferred but plaintext is undefined', () => {
      const schema = csTable('t', { col: csColumn('col').searchableJson() })
      expect(() => resolveIndexType(schema.col)).toThrow(
        'Cannot infer query operation for searchableJson column'
      )
    })

    it('uses explicit queryType over plaintext inference', () => {
      const schema = csTable('t', { col: csColumn('col').searchableJson() })
      // Even with object plaintext, explicit steVecSelector should be used
      const result = resolveIndexType(schema.col, 'steVecSelector', { role: 'admin' })
      expect(result).toEqual({ indexType: 'ste_vec', queryOp: 'ste_vec_selector' })
    })

    it('does not require plaintext for non-ste_vec columns', () => {
      const schema = csTable('t', { col: csColumn('col').equality() })
      const result = resolveIndexType(schema.col)
      expect(result).toEqual({ indexType: 'unique', queryOp: undefined })
    })
  })
})
