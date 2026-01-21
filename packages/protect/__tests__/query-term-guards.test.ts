import { describe, expect, it } from 'vitest'
import {
  isScalarQueryTerm,
  isJsonPathQueryTerm,
  isJsonContainsQueryTerm,
  isJsonContainedByQueryTerm,
} from '../src/query-term-guards'

describe('query-term-guards', () => {
  describe('isScalarQueryTerm', () => {
    it('should return true when both value and indexType are present', () => {
      const term = {
        value: 'test',
        indexType: 'unique',
        column: {},
        table: {},
      }
      expect(isScalarQueryTerm(term)).toBe(true)
    })

    it('should return true with all properties including optional ones', () => {
      const term = {
        value: 'test',
        indexType: 'ore',
        column: {},
        table: {},
        queryOp: 'default',
        returnType: 'eql',
      }
      expect(isScalarQueryTerm(term)).toBe(true)
    })

    it('should return false when value is missing', () => {
      const term = {
        indexType: 'unique',
        column: {},
        table: {},
      }
      expect(isScalarQueryTerm(term)).toBe(false)
    })

    it('should return false when indexType is missing', () => {
      const term = {
        value: 'test',
        column: {},
        table: {},
      }
      expect(isScalarQueryTerm(term)).toBe(false)
    })

    it('should return false when both value and indexType are missing', () => {
      const term = {
        column: {},
        table: {},
      }
      expect(isScalarQueryTerm(term)).toBe(false)
    })

    it('should return false for empty object', () => {
      const term = {}
      expect(isScalarQueryTerm(term)).toBe(false)
    })

    it('should return true with extra properties present', () => {
      const term = {
        value: 'test',
        indexType: 'match',
        column: {},
        table: {},
        extraProp: 'extra',
        anotherProp: 123,
      }
      expect(isScalarQueryTerm(term)).toBe(true)
    })

    it('should return true even when value is null (property exists)', () => {
      const term = {
        value: null,
        indexType: 'unique',
        column: {},
        table: {},
      }
      expect(isScalarQueryTerm(term)).toBe(true)
    })

    it('should return true even when indexType is null (property exists)', () => {
      const term = {
        value: 'test',
        indexType: null,
        column: {},
        table: {},
      }
      expect(isScalarQueryTerm(term)).toBe(true)
    })

    it('should return true even when value is undefined (property exists)', () => {
      const term = {
        value: undefined,
        indexType: 'unique',
        column: {},
        table: {},
      }
      expect(isScalarQueryTerm(term)).toBe(true)
    })

    it('should return true even when indexType is undefined (property exists)', () => {
      const term = {
        value: 'test',
        indexType: undefined,
        column: {},
        table: {},
      }
      expect(isScalarQueryTerm(term)).toBe(true)
    })
  })

  describe('isJsonPathQueryTerm', () => {
    it('should return true when path property exists', () => {
      const term = {
        path: 'user.email',
        column: {},
        table: {},
      }
      expect(isJsonPathQueryTerm(term)).toBe(true)
    })

    it('should return true with all properties including optional ones', () => {
      const term = {
        path: 'user.name',
        value: 'John',
        column: {},
        table: {},
      }
      expect(isJsonPathQueryTerm(term)).toBe(true)
    })

    it('should return true with extra properties', () => {
      const term = {
        path: 'data.nested.field',
        column: {},
        table: {},
        extraProp: 'extra',
        anotherField: 42,
      }
      expect(isJsonPathQueryTerm(term)).toBe(true)
    })

    it('should return false when path property is missing', () => {
      const term = {
        column: {},
        table: {},
        value: 'test',
      }
      expect(isJsonPathQueryTerm(term)).toBe(false)
    })

    it('should return false for empty object', () => {
      const term = {}
      expect(isJsonPathQueryTerm(term)).toBe(false)
    })

    it('should return true even when path is null', () => {
      const term = {
        path: null,
        column: {},
        table: {},
      }
      expect(isJsonPathQueryTerm(term)).toBe(true)
    })

    it('should return true even when path is undefined', () => {
      const term = {
        path: undefined,
        column: {},
        table: {},
      }
      expect(isJsonPathQueryTerm(term)).toBe(true)
    })

    it('should return false when path-like property with different name', () => {
      const term = {
        pathName: 'user.email',
        column: {},
        table: {},
      }
      expect(isJsonPathQueryTerm(term)).toBe(false)
    })
  })

  describe('isJsonContainsQueryTerm', () => {
    it('should return true when contains property exists', () => {
      const term = {
        contains: { key: 'value' },
        column: {},
        table: {},
      }
      expect(isJsonContainsQueryTerm(term)).toBe(true)
    })

    it('should return true with empty object as contains', () => {
      const term = {
        contains: {},
        column: {},
        table: {},
      }
      expect(isJsonContainsQueryTerm(term)).toBe(true)
    })

    it('should return true with complex nested object as contains', () => {
      const term = {
        contains: {
          user: {
            email: 'test@example.com',
            roles: ['admin', 'user'],
          },
        },
        column: {},
        table: {},
      }
      expect(isJsonContainsQueryTerm(term)).toBe(true)
    })

    it('should return true with extra properties', () => {
      const term = {
        contains: { status: 'active' },
        column: {},
        table: {},
        extraProp: 'extra',
        anotherField: 42,
      }
      expect(isJsonContainsQueryTerm(term)).toBe(true)
    })

    it('should return false when contains property is missing', () => {
      const term = {
        column: {},
        table: {},
        data: { key: 'value' },
      }
      expect(isJsonContainsQueryTerm(term)).toBe(false)
    })

    it('should return false for empty object', () => {
      const term = {}
      expect(isJsonContainsQueryTerm(term)).toBe(false)
    })

    it('should return true even when contains is null', () => {
      const term = {
        contains: null,
        column: {},
        table: {},
      }
      expect(isJsonContainsQueryTerm(term)).toBe(true)
    })

    it('should return true even when contains is undefined', () => {
      const term = {
        contains: undefined,
        column: {},
        table: {},
      }
      expect(isJsonContainsQueryTerm(term)).toBe(true)
    })

    it('should return false when contains-like property with different name', () => {
      const term = {
        containsData: { key: 'value' },
        column: {},
        table: {},
      }
      expect(isJsonContainsQueryTerm(term)).toBe(false)
    })
  })

  describe('isJsonContainedByQueryTerm', () => {
    it('should return true when containedBy property exists', () => {
      const term = {
        containedBy: { key: 'value' },
        column: {},
        table: {},
      }
      expect(isJsonContainedByQueryTerm(term)).toBe(true)
    })

    it('should return true with empty object as containedBy', () => {
      const term = {
        containedBy: {},
        column: {},
        table: {},
      }
      expect(isJsonContainedByQueryTerm(term)).toBe(true)
    })

    it('should return true with complex nested object as containedBy', () => {
      const term = {
        containedBy: {
          permissions: {
            read: true,
            write: false,
            admin: true,
          },
        },
        column: {},
        table: {},
      }
      expect(isJsonContainedByQueryTerm(term)).toBe(true)
    })

    it('should return true with extra properties', () => {
      const term = {
        containedBy: { status: 'active' },
        column: {},
        table: {},
        extraProp: 'extra',
        anotherField: 42,
      }
      expect(isJsonContainedByQueryTerm(term)).toBe(true)
    })

    it('should return false when containedBy property is missing', () => {
      const term = {
        column: {},
        table: {},
        data: { key: 'value' },
      }
      expect(isJsonContainedByQueryTerm(term)).toBe(false)
    })

    it('should return false for empty object', () => {
      const term = {}
      expect(isJsonContainedByQueryTerm(term)).toBe(false)
    })

    it('should return true even when containedBy is null', () => {
      const term = {
        containedBy: null,
        column: {},
        table: {},
      }
      expect(isJsonContainedByQueryTerm(term)).toBe(true)
    })

    it('should return true even when containedBy is undefined', () => {
      const term = {
        containedBy: undefined,
        column: {},
        table: {},
      }
      expect(isJsonContainedByQueryTerm(term)).toBe(true)
    })

    it('should return false when containedBy-like property with different name', () => {
      const term = {
        containedByData: { key: 'value' },
        column: {},
        table: {},
      }
      expect(isJsonContainedByQueryTerm(term)).toBe(false)
    })
  })
})
