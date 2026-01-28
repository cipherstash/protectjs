import { csColumn, csTable } from '@cipherstash/schema'
import { describe, expect, it } from 'vitest'
import {
  isJsonContainedByQueryTerm,
  isJsonContainsQueryTerm,
  isJsonPathQueryTerm,
  isScalarQueryTerm,
} from '../src/query-term-guards'
import { queryTypes } from '../src/types'
const users = csTable('users', {
  email: csColumn('email').freeTextSearch().equality().orderAndRange(),
})

describe('query-term-guards', () => {
  describe('isScalarQueryTerm', () => {
    it('should return true when both value and queryType are present', () => {
      const term = {
        value: 'test',
        queryType: queryTypes.equality,
        column: users.email,
        table: users,
      }
      expect(isScalarQueryTerm(term)).toBe(true)
    })

    it('should return true with all properties including optional ones', () => {
      const term = {
        value: 'test',
        queryType: queryTypes.orderAndRange,
        column: users.email,
        table: users,
      }
      expect(isScalarQueryTerm(term)).toBe(true)
    })

    it('should return false when value is missing', () => {
      const term = {
        queryType: queryTypes.equality,
        column: users.email,
        table: users,
      }
      // @ts-expect-error - value is missing
      expect(isScalarQueryTerm(term)).toBe(false)
    })

    it('should return true when queryType is missing (optional - auto-inferred)', () => {
      const term = {
        value: 'test',
        column: users.email,
        table: users,
      }
      // queryType is now optional - terms without it use auto-inference
      expect(isScalarQueryTerm(term)).toBe(true)
    })

    it('should return false when both value and queryType are missing', () => {
      const term = {
        column: users.email,
        table: users,
      }
      // @ts-expect-error - value is missing
      expect(isScalarQueryTerm(term)).toBe(false)
    })

    it('should return false for empty object', () => {
      const term = {}

      // @ts-expect-error - empty object is not a valid query term
      expect(isScalarQueryTerm(term)).toBe(false)
    })

    it('should return true with extra properties present', () => {
      const term = {
        value: 'test',
        queryType: queryTypes.freeTextSearch,
        column: users.email,
        table: users,
        extraProp: 'extra',
        anotherProp: 123,
      }
      expect(isScalarQueryTerm(term)).toBe(true)
    })

    it('should return true even when queryType is null (property exists)', () => {
      const term = {
        value: 'test',
        queryType: null,
        column: users.email,
        table: users,
      }

      // @ts-expect-error - queryType is null
      expect(isScalarQueryTerm(term)).toBe(true)
    })

    it('should return true even when value is undefined (property exists)', () => {
      const term = {
        value: undefined,
        queryType: queryTypes.equality,
        column: users.email,
        table: users,
      }

      // @ts-expect-error - value is undefined
      expect(isScalarQueryTerm(term)).toBe(true)
    })

    it('should return true even when queryType is undefined (property exists)', () => {
      const term = {
        value: 'test',
        queryType: undefined,
        column: users.email,
        table: users,
      }

      expect(isScalarQueryTerm(term)).toBe(true)
    })
  })

  describe('isJsonPathQueryTerm', () => {
    it('should return true when path property exists', () => {
      const term = {
        path: 'user.email',
        column: users.email,
        table: users,
      }

      expect(isJsonPathQueryTerm(term)).toBe(true)
    })

    it('should return true with all properties including optional ones', () => {
      const term = {
        path: 'user.name',
        value: 'John',
        column: users.email,
        table: users,
      }

      expect(isJsonPathQueryTerm(term)).toBe(true)
    })

    it('should return true with extra properties', () => {
      const term = {
        path: 'data.nested.field',
        column: users.email,
        table: users,
        extraProp: 'extra',
        anotherField: 42,
      }
      expect(isJsonPathQueryTerm(term)).toBe(true)
    })

    it('should return false when path property is missing', () => {
      const term = {
        column: users.email,
        table: users,
        value: 'test',
      }

      expect(isJsonPathQueryTerm(term)).toBe(false)
    })

    it('should return false for empty object', () => {
      const term = {}

      // @ts-expect-error - empty object is not a valid query term
      expect(isJsonPathQueryTerm(term)).toBe(false)
    })

    it('should return true even when path is null', () => {
      const term = {
        path: null,
        column: users.email,
        table: users,
      }

      // @ts-expect-error - path is missing
      expect(isJsonPathQueryTerm(term)).toBe(true)
    })

    it('should return true even when path is undefined', () => {
      const term = {
        path: undefined,
        column: users.email,
        table: users,
      }

      // @ts-expect-error - path is undefined
      expect(isJsonPathQueryTerm(term)).toBe(true)
    })

    it('should return false when path-like property with different name', () => {
      const term = {
        pathName: 'user.email',
        column: users.email,
        table: users,
      }

      // @ts-expect-error - pathName is not a valid property
      expect(isJsonPathQueryTerm(term)).toBe(false)
    })
  })

  describe('isJsonContainsQueryTerm', () => {
    it('should return true when contains property exists', () => {
      const term = {
        contains: { key: 'value' },
        column: users.email,
        table: users,
      }
      expect(isJsonContainsQueryTerm(term)).toBe(true)
    })

    it('should return true with empty object as contains', () => {
      const term = {
        contains: {},
        column: users.email,
        table: users,
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
        column: users.email,
        table: users,
      }
      expect(isJsonContainsQueryTerm(term)).toBe(true)
    })

    it('should return true with extra properties', () => {
      const term = {
        contains: { status: 'active' },
        column: users.email,
        table: users,
        extraProp: 'extra',
        anotherField: 42,
      }

      expect(isJsonContainsQueryTerm(term)).toBe(true)
    })

    it('should return false when contains property is missing', () => {
      const term = {
        column: users.email,
        table: users,
        data: { key: 'value' },
      }

      // @ts-expect-error - contains is missing
      expect(isJsonContainsQueryTerm(term)).toBe(false)
    })

    it('should return false for empty object', () => {
      const term = {}

      // @ts-expect-error - empty object is not a valid query term
      expect(isJsonContainsQueryTerm(term)).toBe(false)
    })

    it('should return true even when contains is null', () => {
      const term = {
        contains: null,
        column: users.email,
        table: users,
      }

      // @ts-expect-error - contains is null
      expect(isJsonContainsQueryTerm(term)).toBe(true)
    })

    it('should return true even when contains is undefined', () => {
      const term = {
        contains: undefined,
        column: users.email,
        table: users,
      }

      // @ts-expect-error - contains is undefined
      expect(isJsonContainsQueryTerm(term)).toBe(true)
    })

    it('should return false when contains-like property with different name', () => {
      const term = {
        containsData: { key: 'value' },
        column: users.email,
        table: users,
      }

      // @ts-expect-error - containsData is not a valid property
      expect(isJsonContainsQueryTerm(term)).toBe(false)
    })
  })

  describe('isJsonContainedByQueryTerm', () => {
    it('should return true when containedBy property exists', () => {
      const term = {
        containedBy: { key: 'value' },
        column: users.email,
        table: users,
      }
      expect(isJsonContainedByQueryTerm(term)).toBe(true)
    })

    it('should return true with empty object as containedBy', () => {
      const term = {
        containedBy: {},
        column: users.email,
        table: users,
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
        column: users.email,
        table: users,
      }
      expect(isJsonContainedByQueryTerm(term)).toBe(true)
    })

    it('should return true with extra properties', () => {
      const term = {
        containedBy: { status: 'active' },
        column: users.email,
        table: users,
        extraProp: 'extra',
        anotherField: 42,
      }
      expect(isJsonContainedByQueryTerm(term)).toBe(true)
    })

    it('should return false when containedBy property is missing', () => {
      const term = {
        column: users.email,
        table: users,
        data: { key: 'value' },
      }

      // @ts-expect-error - containedBy is missing
      expect(isJsonContainedByQueryTerm(term)).toBe(false)
    })

    it('should return false for empty object', () => {
      const term = {}

      // @ts-expect-error - empty object is not a valid query term
      expect(isJsonContainedByQueryTerm(term)).toBe(false)
    })

    it('should return true even when containedBy is null', () => {
      const term = {
        containedBy: null,
        column: users.email,
        table: users,
      }

      // @ts-expect-error - containedBy is null
      expect(isJsonContainedByQueryTerm(term)).toBe(true)
    })

    it('should return true even when containedBy is undefined', () => {
      const term = {
        containedBy: undefined,
        column: users.email,
        table: users,
      }

      // @ts-expect-error - containedBy is undefined
      expect(isJsonContainedByQueryTerm(term)).toBe(true)
    })

    it('should return false when containedBy-like property with different name', () => {
      const term = {
        containedByData: { key: 'value' },
        column: users.email,
        table: users,
      }

      // @ts-expect-error - containedByData is not a valid property
      expect(isJsonContainedByQueryTerm(term)).toBe(false)
    })
  })
})
