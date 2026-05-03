import { describe, expect, it } from 'vitest'
import {
  type DbTable,
  allSearchOps,
  buildColumnDefs,
  joinNames,
  pgTypeToDataType,
} from '../introspect.js'

const usersTable: DbTable = {
  tableName: 'users',
  columns: [
    {
      columnName: 'id',
      dataType: 'integer',
      udtName: 'int4',
      isEqlEncrypted: false,
    },
    {
      columnName: 'email',
      dataType: 'text',
      udtName: 'text',
      isEqlEncrypted: false,
    },
    {
      columnName: 'name',
      dataType: 'text',
      udtName: 'text',
      isEqlEncrypted: false,
    },
    {
      columnName: 'ssn',
      dataType: 'USER-DEFINED',
      udtName: 'eql_v2_encrypted',
      isEqlEncrypted: true,
    },
  ],
}

const usersTableNoEql: DbTable = {
  tableName: 'plain',
  columns: usersTable.columns.filter((c) => !c.isEqlEncrypted),
}

describe('pgTypeToDataType', () => {
  it.each([
    ['int4', 'number'],
    ['numeric', 'number'],
    ['bool', 'boolean'],
    ['timestamptz', 'date'],
    ['jsonb', 'json'],
    ['text', 'string'],
    ['unknown_udt', 'string'],
  ])('%s → %s', (udt, expected) => {
    expect(pgTypeToDataType(udt)).toBe(expected)
  })
})

describe('allSearchOps', () => {
  it('includes freeTextSearch only for strings', () => {
    expect(allSearchOps('string')).toContain('freeTextSearch')
    expect(allSearchOps('number')).not.toContain('freeTextSearch')
    expect(allSearchOps('date')).not.toContain('freeTextSearch')
  })

  it('always includes equality and orderAndRange', () => {
    for (const t of ['string', 'number', 'boolean', 'date', 'json'] as const) {
      expect(allSearchOps(t)).toEqual(
        expect.arrayContaining(['equality', 'orderAndRange']),
      )
    }
  })
})

describe('buildColumnDefs', () => {
  it('always includes already-encrypted columns even when not picked', () => {
    const defs = buildColumnDefs(usersTable, ['email'], true)
    expect(defs.map((c) => c.name)).toEqual(['email', 'ssn'])
  })

  it('preserves source column order', () => {
    const defs = buildColumnDefs(usersTable, ['name', 'email'], true)
    // email comes before name in usersTable
    expect(defs.map((c) => c.name)).toEqual(['email', 'name', 'ssn'])
  })

  it('drops search ops when searchable is false', () => {
    const defs = buildColumnDefs(usersTable, ['email'], false)
    for (const c of defs) {
      expect(c.searchOps).toEqual([])
    }
  })

  it('emits the locked column when nothing was picked', () => {
    const defs = buildColumnDefs(usersTable, [], true)
    expect(defs.map((c) => c.name)).toEqual(['ssn'])
  })

  it('returns an empty array when nothing is picked and nothing is locked', () => {
    expect(buildColumnDefs(usersTableNoEql, [], true)).toEqual([])
  })

  it('maps udt to dataType correctly', () => {
    const defs = buildColumnDefs(usersTable, ['email', 'id'], true)
    const email = defs.find((c) => c.name === 'email')
    const id = defs.find((c) => c.name === 'id')
    expect(email?.dataType).toBe('string')
    expect(id?.dataType).toBe('number')
  })
})

describe('joinNames', () => {
  it('formats one name', () => {
    expect(joinNames(['a'])).toBe('a')
  })

  it('formats two names with "and"', () => {
    expect(joinNames(['a', 'b'])).toBe('a and b')
  })

  it('formats three names with Oxford comma', () => {
    expect(joinNames(['a', 'b', 'c'])).toBe('a, b, and c')
  })
})
