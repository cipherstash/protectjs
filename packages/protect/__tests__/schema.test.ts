import { csColumn, csTable, buildEncryptConfig } from '../src/schema'
import { describe, it, expect } from 'vitest'

describe('Schema with nested columns', () => {
  it('should handle nested column structures in encrypt config', () => {
    const users = csTable('users', {
      email: csColumn('email').freeTextSearch().equality().orderAndRange(),
      address: csColumn('address').freeTextSearch(),
      example: {
        field: csColumn('field').freeTextSearch(),
        nested: {
          deep: csColumn('deep').equality(),
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
      indexes: {
        match: expect.any(Object),
      },
    })

    // Verify deeply nested field configuration
    expect(columns['example.nested.deep']).toEqual({
      cast_as: 'text',
      indexes: {
        unique: expect.any(Object),
      },
    })
  })

  it('should handle multiple tables with nested columns', () => {
    const users = csTable('users', {
      email: csColumn('email').equality(),
      profile: {
        name: csColumn('name').freeTextSearch(),
      },
    } as const)

    const posts = csTable('posts', {
      title: csColumn('title').freeTextSearch(),
      metadata: {
        tags: csColumn('tags').equality(),
      },
    } as const)

    const config = buildEncryptConfig(users, posts)

    // Verify both tables are present
    expect(Object.keys(config.tables)).toEqual(['users', 'posts'])

    // Verify users table columns
    expect(Object.keys(config.tables.users)).toEqual(['email', 'profile.name'])
    expect(config.tables.users.email.indexes).toHaveProperty('unique')
    expect(config.tables.users['profile.name'].indexes).toHaveProperty('match')

    // Verify posts table columns
    expect(Object.keys(config.tables.posts)).toEqual(['title', 'metadata.tags'])
    expect(config.tables.posts.title.indexes).toHaveProperty('match')
    expect(config.tables.posts['metadata.tags'].indexes).toHaveProperty(
      'unique',
    )
  })

  it('should handle complex nested structures with multiple index types', () => {
    const complex = csTable('complex', {
      id: csColumn('id').equality(),
      content: {
        text: csColumn('text').freeTextSearch().orderAndRange(),
        metadata: {
          tags: csColumn('tags').equality().freeTextSearch(),
          stats: {
            views: csColumn('views').orderAndRange(),
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
      indexes: {
        unique: expect.any(Object),
        match: expect.any(Object),
      },
    })

    // Verify deeply nested column with order and range
    expect(config.tables.complex['content.metadata.stats.views']).toEqual({
      cast_as: 'text',
      indexes: {
        ore: {},
      },
    })
  })
})
