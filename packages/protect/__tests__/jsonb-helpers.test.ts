import { describe, it, expect } from 'vitest'
// Import from helpers module (also available from package root)
import { toJsonPath, buildNestedObject, parseJsonbPath } from '../src/helpers'

describe('toJsonPath', () => {
  it('converts simple path to JSONPath format', () => {
    expect(toJsonPath('name')).toBe('$.name')
  })

  it('converts nested path to JSONPath format', () => {
    expect(toJsonPath('user.email')).toBe('$.user.email')
  })

  it('converts deeply nested path', () => {
    expect(toJsonPath('user.profile.settings.theme')).toBe('$.user.profile.settings.theme')
  })

  it('returns unchanged if already in JSONPath format', () => {
    expect(toJsonPath('$.user.email')).toBe('$.user.email')
  })

  it('normalizes bare $ prefix', () => {
    expect(toJsonPath('$user.email')).toBe('$.user.email')
  })

  it('handles path starting with dot', () => {
    expect(toJsonPath('.user.email')).toBe('$.user.email')
  })

  it('handles root path', () => {
    expect(toJsonPath('$')).toBe('$')
  })

  it('handles empty string', () => {
    expect(toJsonPath('')).toBe('$')
  })
})

describe('buildNestedObject', () => {
  it('builds single-level object', () => {
    expect(buildNestedObject('name', 'alice')).toEqual({ name: 'alice' })
  })

  it('builds two-level nested object', () => {
    expect(buildNestedObject('user.role', 'admin')).toEqual({
      user: { role: 'admin' }
    })
  })

  it('builds deeply nested object', () => {
    expect(buildNestedObject('a.b.c.d', 'value')).toEqual({
      a: { b: { c: { d: 'value' } } }
    })
  })

  it('handles numeric values', () => {
    expect(buildNestedObject('user.age', 30)).toEqual({
      user: { age: 30 }
    })
  })

  it('handles boolean values', () => {
    expect(buildNestedObject('user.active', true)).toEqual({
      user: { active: true }
    })
  })

  it('handles null values', () => {
    expect(buildNestedObject('user.data', null)).toEqual({
      user: { data: null }
    })
  })

  it('handles object values', () => {
    const value = { nested: 'object' }
    expect(buildNestedObject('user.config', value)).toEqual({
      user: { config: { nested: 'object' } }
    })
  })

  it('handles array values', () => {
    expect(buildNestedObject('user.tags', ['admin', 'user'])).toEqual({
      user: { tags: ['admin', 'user'] }
    })
  })

  it('strips JSONPath prefix from path', () => {
    expect(buildNestedObject('$.user.role', 'admin')).toEqual({
      user: { role: 'admin' }
    })
  })

  it('throws on empty path', () => {
    expect(() => buildNestedObject('', 'value')).toThrow('Path cannot be empty')
  })

  it('throws on root-only path', () => {
    expect(() => buildNestedObject('$', 'value')).toThrow('Path must contain at least one segment')
  })
})

describe('parseJsonbPath', () => {
  it('parses simple path', () => {
    expect(parseJsonbPath('name')).toEqual(['name'])
  })

  it('parses nested path', () => {
    expect(parseJsonbPath('user.email')).toEqual(['user', 'email'])
  })

  it('parses deeply nested path', () => {
    expect(parseJsonbPath('a.b.c.d')).toEqual(['a', 'b', 'c', 'd'])
  })

  it('strips JSONPath prefix', () => {
    expect(parseJsonbPath('$.user.email')).toEqual(['user', 'email'])
  })

  it('strips bare $ prefix', () => {
    expect(parseJsonbPath('$user.email')).toEqual(['user', 'email'])
  })

  it('handles empty string', () => {
    expect(parseJsonbPath('')).toEqual([])
  })

  it('handles root only', () => {
    expect(parseJsonbPath('$')).toEqual([])
  })

  it('filters empty segments', () => {
    expect(parseJsonbPath('user..email')).toEqual(['user', 'email'])
  })
})
