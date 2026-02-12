import { describe, expect, it } from 'vitest'
import {
  buildEncryptConfig,
  encryptedColumn,
  encryptedTable,
} from '../src/index'

describe('searchableJson()', () => {
  it('sets cast_as to json and ste_vec marker on column build', () => {
    const column = encryptedColumn('metadata').searchableJson()
    const config = column.build()

    expect(config.cast_as).toBe('json')
    expect(config.indexes.ste_vec?.prefix).toBe('enabled')
  })

  it('is chainable', () => {
    const column = encryptedColumn('metadata')
    expect(column.searchableJson()).toBe(column)
  })
})

describe('encryptedTable.build() with searchableJson', () => {
  it('transforms prefix to table/column format', () => {
    const users = encryptedTable('users', {
      metadata: encryptedColumn('metadata').searchableJson(),
    })
    const built = users.build()

    expect(built.columns.metadata.cast_as).toBe('json')
    expect(built.columns.metadata.indexes.ste_vec?.prefix).toBe(
      'users/metadata',
    )
  })
})

describe('buildEncryptConfig with searchableJson', () => {
  it('emits ste_vec index with table/column prefix', () => {
    const users = encryptedTable('users', {
      metadata: encryptedColumn('metadata').searchableJson(),
    })

    const config = buildEncryptConfig(users)

    expect(config.tables.users.metadata.cast_as).toBe('json')
    expect(config.tables.users.metadata.indexes.ste_vec?.prefix).toBe(
      'users/metadata',
    )
  })
})
