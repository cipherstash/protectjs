import { csColumn, csTable, buildEncryptConfig, csValue } from '../src/schema'
import { describe, it, expect } from 'vitest'

describe('Schema with nested columns', () => {
  it('should handle nested column structures in encrypt config', () => {
    const users = csTable('users', {
      email: csColumn('email').freeTextSearch().equality().orderAndRange(),
      address: csColumn('address').freeTextSearch(),
      example: {
        field: csValue('example.field'),
        nested: {
          deep: csValue('example.nested.deep'),
        },
      },
    } as const)

    const config = buildEncryptConfig(users)

    // Verify basic structure
    expect(config).toEqual({
      v: 2,
      tables: {
        users: expect.any(Object),
      },
    })

    // Verify all columns are present with correct names
    const columns = config.tables.users
    expect(Object.keys(columns)).toEqual([
      'email',
      'address',
      'example.field',
      'example.nested.deep',
    ])

    // Verify email column configuration
    expect(columns.email).toEqual({
      cast_as: 'text',
      indexes: {
        match: expect.any(Object),
        unique: expect.any(Object),
        ore: {},
      },
    })

    // Verify address column configuration
    expect(columns.address).toEqual({
      cast_as: 'text',
      indexes: {
        match: expect.any(Object),
      },
    })

    // Verify nested field configuration
    expect(columns['example.field']).toEqual({
      cast_as: 'text',
      indexes: {},
    })

    // Verify deeply nested field configuration
    expect(columns['example.nested.deep']).toEqual({
      cast_as: 'text',
      indexes: {},
    })
  })

  it('should handle multiple tables with nested columns', () => {
    const users = csTable('users', {
      email: csColumn('email').equality(),
      profile: {
        name: csValue('profile.name'),
      },
    } as const)

    const posts = csTable('posts', {
      title: csColumn('title').freeTextSearch(),
      metadata: {
        tags: csValue('metadata.tags'),
      },
    } as const)

    const config = buildEncryptConfig(users, posts)

    // Verify both tables are present
    expect(Object.keys(config.tables)).toEqual(['users', 'posts'])

    // Verify users table columns
    expect(Object.keys(config.tables.users)).toEqual(['email', 'profile.name'])
    expect(config.tables.users.email.indexes).toHaveProperty('unique')

    // Verify posts table columns
    expect(Object.keys(config.tables.posts)).toEqual(['title', 'metadata.tags'])
    expect(config.tables.posts.title.indexes).toHaveProperty('match')
  })

  it('should handle complex nested structures with multiple index types', () => {
    const complex = csTable('complex', {
      id: csColumn('id').equality(),
      content: {
        text: csValue('content.text'),
        metadata: {
          tags: csValue('content.metadata.tags'),
          stats: {
            views: csValue('content.metadata.stats.views'),
          },
        },
      },
    } as const)

    const config = buildEncryptConfig(complex)

    // Verify all columns are present
    expect(Object.keys(config.tables.complex)).toEqual([
      'id',
      'content.text',
      'content.metadata.tags',
      'content.metadata.stats.views',
    ])

    // Verify complex nested column with multiple indexes
    expect(config.tables.complex['content.metadata.tags']).toEqual({
      cast_as: 'text',
      indexes: {},
    })

    // Verify deeply nested column with order and range
    expect(config.tables.complex['content.metadata.stats.views']).toEqual({
      cast_as: 'text',
      indexes: {},
    })
  })
})
