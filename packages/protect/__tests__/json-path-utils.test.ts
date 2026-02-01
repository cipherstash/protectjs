import { describe, expect, it } from 'vitest'
import { toJsonPath } from '../src/ffi/operations/json-path-utils'

describe('json-path-utils', () => {
  describe('toJsonPath', () => {
    it('should convert single segment array to JSONPath', () => {
      expect(toJsonPath(['user'])).toBe('$.user')
    })

    it('should convert multi-segment array to JSONPath', () => {
      expect(toJsonPath(['user', 'email'])).toBe('$.user.email')
    })

    it('should convert dot-separated string to JSONPath', () => {
      expect(toJsonPath('user.email')).toBe('$.user.email')
    })

    it('should use bracket notation for segments with special characters', () => {
      expect(toJsonPath(['field-name'])).toBe('$["field-name"]')
    })

    it('should use bracket notation for segments with spaces', () => {
      expect(toJsonPath(['field name'])).toBe('$["field name"]')
    })

    it('should mix dot and bracket notation as needed', () => {
      expect(toJsonPath(['user', 'field-name'])).toBe('$.user["field-name"]')
    })

    it('should escape quotes in segment names', () => {
      expect(toJsonPath(['field"quote'])).toBe('$["field\\"quote"]')
    })

    it('should return root selector for empty path', () => {
      expect(toJsonPath([])).toBe('$')
    })

    it('should handle deeply nested paths', () => {
      expect(toJsonPath(['a', 'b', 'c', 'd'])).toBe('$.a.b.c.d')
    })

    it('should handle numeric segment names', () => {
      expect(toJsonPath(['user', '123'])).toBe('$.user.123')
    })

    it('should handle underscore in segment names', () => {
      expect(toJsonPath(['user_name'])).toBe('$.user_name')
    })
  })
})
