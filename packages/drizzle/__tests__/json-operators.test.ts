import { describe, expect, it } from 'vitest'
import { pgTable } from 'drizzle-orm/pg-core'
import { encryptedType, getEncryptedColumnConfig } from '../src/pg'

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
