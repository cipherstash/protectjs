import { describe, it, expect } from 'vitest'
import { buildEncryptConfig, csTable, csColumn } from '../src/index'

describe('searchableJson()', () => {
  it('sets cast_as to json and ste_vec marker on column build', () => {
    const column = csColumn('metadata').searchableJson()
    const config = column.build()

    expect(config.cast_as).toBe('json')
    expect(config.indexes.ste_vec?.prefix).toBe('enabled')
  })

  it('is chainable', () => {
    const column = csColumn('metadata')
    expect(column.searchableJson()).toBe(column)
  })
})

describe('ProtectTable.build() with searchableJson', () => {
  it('transforms prefix to table/column format', () => {
    const users = csTable('users', {
      metadata: csColumn('metadata').searchableJson()
    })
    const built = users.build()

    expect(built.columns.metadata.cast_as).toBe('json')
    expect(built.columns.metadata.indexes.ste_vec?.prefix).toBe('users/metadata')
  })
})

describe('buildEncryptConfig with searchableJson', () => {
  it('emits ste_vec index with table/column prefix', () => {
    const users = csTable('users', {
      metadata: csColumn('metadata').searchableJson()
    })

    const config = buildEncryptConfig(users)

    expect(config.tables.users.metadata.cast_as).toBe('json')
    expect(config.tables.users.metadata.indexes.ste_vec?.prefix).toBe(
      'users/metadata'
    )
  })
})
