import { describe, expect, it } from 'vitest'
import { pgTable } from 'drizzle-orm/pg-core'
import { encryptedType, getEncryptedColumnConfig, extractProtectSchema } from '../src/pg'
import { normalizePath } from '../src/pg/json-operators'

describe('searchableJson column config', () => {
  it('should store searchableJson config on encrypted column', () => {
    const testTable = pgTable('test', {
      metadata: encryptedType<{ user: { email: string } }>('metadata', {
        dataType: 'json',
        searchableJson: true,
      }),
    })

    const config = getEncryptedColumnConfig('metadata', testTable.metadata)
    expect(config).toBeDefined()
    expect(config?.searchableJson).toBe(true)
    expect(config?.dataType).toBe('json')
  })

  it('should default searchableJson to undefined when not specified', () => {
    const testTable = pgTable('test', {
      profile: encryptedType<{ name: string }>('profile', {
        dataType: 'json',
      }),
    })

    const config = getEncryptedColumnConfig('profile', testTable.profile)
    expect(config).toBeDefined()
    expect(config?.searchableJson).toBeUndefined()
  })
})

describe('schema extraction with searchableJson', () => {
  it('should extract searchableJson config to ProtectColumn', () => {
    const testTable = pgTable('test_json', {
      metadata: encryptedType<{ user: { email: string } }>('metadata', {
        dataType: 'json',
        searchableJson: true,
      }),
    })

    const protectSchema = extractProtectSchema(testTable)
    const builtSchema = protectSchema.build()

    // The column should have ste_vec index configured
    expect(builtSchema.columns.metadata).toBeDefined()
    const columnConfig = builtSchema.columns.metadata
    expect(columnConfig.indexes.ste_vec).toBeDefined()
  })

  it('should not add ste_vec index when searchableJson is not set', () => {
    const testTable = pgTable('test_json_no_search', {
      profile: encryptedType<{ name: string }>('profile', {
        dataType: 'json',
      }),
    })

    const protectSchema = extractProtectSchema(testTable)
    const builtSchema = protectSchema.build()

    expect(builtSchema.columns.profile).toBeDefined()
    const columnConfig = builtSchema.columns.profile
    expect(columnConfig.indexes.ste_vec).toBeUndefined()
  })
})

describe('normalizePath', () => {
  it('should strip $. prefix from JSONPath format', () => {
    expect(normalizePath('$.user.email')).toBe('user.email')
  })

  it('should handle root path $', () => {
    expect(normalizePath('$')).toBe('')
  })

  it('should pass through dot notation unchanged', () => {
    expect(normalizePath('user.email')).toBe('user.email')
  })

  it('should handle array index notation', () => {
    expect(normalizePath('$.items[0].name')).toBe('items[0].name')
  })

  it('should handle empty string', () => {
    expect(normalizePath('')).toBe('')
  })
})
