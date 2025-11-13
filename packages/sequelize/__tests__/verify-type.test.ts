import { Sequelize } from 'sequelize'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  ensureEqlType,
  getEqlTypeInfo,
  verifyEqlType,
} from '../src/verify-type'
import 'dotenv/config'

// Skip these tests if no DATABASE_URL (they require real PostgreSQL with EQL)
const DATABASE_URL = process.env.DATABASE_URL
const describeIfDb = DATABASE_URL ? describe : describe.skip

describeIfDb('Type Verification (Requires EQL)', () => {
  let sequelize: Sequelize
  let hasEqlType: boolean

  beforeAll(async () => {
    if (!DATABASE_URL) {
      throw new Error('DATABASE_URL not set')
    }

    sequelize = new Sequelize(DATABASE_URL, {
      dialect: 'postgres',
      logging: false,
    })

    // Check if EQL type exists
    hasEqlType = await verifyEqlType(sequelize)

    if (!hasEqlType) {
      console.warn(
        '\n⚠️  EQL type not found in database. Some tests will be skipped.',
      )
      console.warn('   Install EQL extension to run all tests.')
      console.warn('   See: https://docs.cipherstash.com/reference/eql\n')
    }
  })

  afterAll(async () => {
    await sequelize.close()
  })

  it('should verify eql_v2_encrypted type (returns boolean)', async () => {
    const exists = await verifyEqlType(sequelize)
    expect(typeof exists).toBe('boolean')

    if (!exists) {
      console.warn('   ⚠️  Type not found - install EQL extension')
    }
  })

  it('should throw when ensuring type if not exists', async () => {
    if (hasEqlType) {
      // Type exists, should not throw
      await expect(ensureEqlType(sequelize)).resolves.toBeUndefined()
    } else {
      // Type doesn't exist, should throw
      await expect(ensureEqlType(sequelize)).rejects.toThrow(
        'PostgreSQL type "eql_v2_encrypted" not found',
      )
    }
  })

  it('should get type information if type exists', async () => {
    const info = await getEqlTypeInfo(sequelize)

    if (hasEqlType) {
      // Type exists, should return info
      expect(info).not.toBeNull()
      expect(info?.typname).toBe('eql_v2_encrypted')
      expect(info?.schema).toBe('public')
      expect(info?.attributes).toBeDefined()
      expect(Array.isArray(info?.attributes)).toBe(true)

      // The type should have a 'data' attribute of type 'jsonb'
      const dataAttr = info?.attributes.find((attr) => attr.attname === 'data')
      expect(dataAttr).toBeDefined()
      expect(dataAttr?.typname).toBe('jsonb')
    } else {
      // Type doesn't exist, should return null or undefined
      expect(info == null).toBe(true)
    }
  })

  it('should throw error for non-PostgreSQL dialect', async () => {
    // Mock a non-postgres sequelize instance without actually connecting
    const mockSequelize = {
      getDialect: () => 'mysql',
    // biome-ignore lint/suspicious/noExplicitAny: mock Sequelize instance
    } as any

    await expect(verifyEqlType(mockSequelize)).rejects.toThrow(
      'EQL extension is only available for PostgreSQL',
    )
  })
})

describe('Type Verification (Unit Tests)', () => {
  it('should export verification functions', () => {
    expect(typeof verifyEqlType).toBe('function')
    expect(typeof ensureEqlType).toBe('function')
    expect(typeof getEqlTypeInfo).toBe('function')
  })
})
