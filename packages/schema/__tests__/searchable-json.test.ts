import { describe, expect, it } from 'vitest'
import { buildEncryptConfig, csColumn, csTable } from '../src'

describe('searchableJson schema method', () => {
  it('should configure ste_vec index with correct prefix', () => {
    const users = csTable('users', {
      metadata: csColumn('metadata').searchableJson(),
    })

    const config = buildEncryptConfig(users)

    expect(config.tables.users.metadata.cast_as).toBe('json')
    expect(config.tables.users.metadata.indexes.ste_vec).toBeDefined()
    expect(config.tables.users.metadata.indexes.ste_vec?.prefix).toBe(
      'users/metadata',
    )
  })

  it('should allow chaining with other column methods', () => {
    const users = csTable('users', {
      data: csColumn('data').searchableJson(),
    })

    const config = buildEncryptConfig(users)

    expect(config.tables.users.data.cast_as).toBe('json')
    expect(config.tables.users.data.indexes.ste_vec?.prefix).toBe('users/data')
  })

  it('should work alongside regular encrypted columns', () => {
    const users = csTable('users', {
      email: csColumn('email').equality(),
      metadata: csColumn('metadata').searchableJson(),
    })

    const config = buildEncryptConfig(users)

    expect(config.tables.users.email.indexes.unique).toBeDefined()
    expect(config.tables.users.metadata.indexes.ste_vec).toBeDefined()
  })
})
