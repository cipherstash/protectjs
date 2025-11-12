import { DataTypes, Model } from 'sequelize'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEncryptedType } from '../src/data-type'
import {
  extractProtectSchema,
  extractProtectSchemas,
} from '../src/schema-extraction'

describe('extractProtectSchema', () => {
  let ENCRYPTED: ReturnType<typeof createEncryptedType>

  beforeEach(() => {
    ENCRYPTED = createEncryptedType()
  })

  it('should extract schema from model with encrypted columns', () => {
    // Mock a Sequelize model
    // biome-ignore lint/suspicious/noExplicitAny: mock Sequelize model
    const mockModel: any = {
      tableName: 'users',
      name: 'User',
      getAttributes: () => ({
        id: { type: DataTypes.INTEGER },
        email: {
          type: ENCRYPTED('email', {
            dataType: 'string',
            equality: true,
            freeTextSearch: true,
          }),
        },
        age: {
          type: ENCRYPTED('age', { dataType: 'number', orderAndRange: true }),
        },
      }),
    }

    const schema = extractProtectSchema(mockModel)

    expect(schema).toBeDefined()
    expect(schema.tableName).toBe('users')
    // Schema should have email and age columns
    const builtSchema = schema.build()
    expect(Object.keys(builtSchema.columns)).toContain('email')
    expect(Object.keys(builtSchema.columns)).toContain('age')
  })

  it('should throw error if model has no encrypted columns', () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock Sequelize model
    const mockModel: any = {
      tableName: 'users',
      name: 'User',
      getAttributes: () => ({
        id: { type: DataTypes.INTEGER },
        name: { type: DataTypes.STRING },
      }),
    }

    expect(() => extractProtectSchema(mockModel)).toThrow(
      'Model users has no encrypted columns',
    )
  })

  it('should map equality config to unique index', () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock Sequelize model
    const mockModel: any = {
      tableName: 'users',
      name: 'User',
      getAttributes: () => ({
        email: { type: ENCRYPTED('email', { equality: true }) },
      }),
    }

    const schema = extractProtectSchema(mockModel)
    const builtSchema = schema.build()
    const emailColumn = builtSchema.columns.email

    expect(emailColumn.indexes.unique).toBeDefined()
    expect(emailColumn.indexes.unique.token_filters).toContainEqual(
      expect.objectContaining({ kind: 'downcase' }),
    )
  })

  it('should map orderAndRange config to ore index', () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock Sequelize model
    const mockModel: any = {
      tableName: 'users',
      name: 'User',
      getAttributes: () => ({
        age: {
          type: ENCRYPTED('age', { dataType: 'number', orderAndRange: true }),
        },
      }),
    }

    const schema = extractProtectSchema(mockModel)
    const builtSchema = schema.build()
    const ageColumn = builtSchema.columns.age

    expect(ageColumn.indexes.ore).toBeDefined()
  })
})

describe('extractProtectSchemas', () => {
  let ENCRYPTED: ReturnType<typeof createEncryptedType>

  beforeEach(() => {
    ENCRYPTED = createEncryptedType()
  })

  it('should extract schemas from multiple models', () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock Sequelize model
    const mockUserModel: any = {
      tableName: 'users',
      name: 'User',
      getAttributes: () => ({
        email: { type: ENCRYPTED('email', { equality: true }) },
      }),
    }

    // biome-ignore lint/suspicious/noExplicitAny: mock Sequelize model
    const mockPostModel: any = {
      tableName: 'posts',
      name: 'Post',
      getAttributes: () => ({
        title: { type: ENCRYPTED('title', { freeTextSearch: true }) },
      }),
    }

    const schemas = extractProtectSchemas(mockUserModel, mockPostModel)

    expect(schemas).toHaveLength(2)
    expect(schemas[0].tableName).toBe('users')
    expect(schemas[1].tableName).toBe('posts')
  })
})
