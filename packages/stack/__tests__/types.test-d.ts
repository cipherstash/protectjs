import { describe, expectTypeOf, it } from 'vitest'
import { encryptedColumn, encryptedTable } from '../src/schema/index.js'
import type {
  InferEncrypted,
  InferPlaintext,
  ProtectColumn,
  ProtectTable,
  ProtectTableColumn,
  ProtectValue,
} from '../src/schema/index.js'
import type {
  Decrypted,
  DecryptedFields,
  Encrypted,
  EncryptedFields,
  EncryptedReturnType,
  KeysetIdentifier,
  OtherFields,
  QueryTypeName,
} from '../src/types.js'

describe('Type inference', () => {
  it('encryptedTable returns ProtectTable with column access', () => {
    const table = encryptedTable('users', {
      email: encryptedColumn('email'),
    })
    expectTypeOf(table.email).toMatchTypeOf<ProtectColumn>()
    expectTypeOf(table.tableName).toBeString()
  })

  it('encryptedTable is also a ProtectTable', () => {
    const table = encryptedTable('users', {
      email: encryptedColumn('email'),
    })
    expectTypeOf(table).toMatchTypeOf<ProtectTable<{ email: ProtectColumn }>>()
  })

  it('encryptedColumn returns ProtectColumn', () => {
    const col = encryptedColumn('email')
    expectTypeOf(col).toMatchTypeOf<ProtectColumn>()
  })

  it('encryptedColumn().dataType() returns ProtectColumn (for chaining)', () => {
    const col = encryptedColumn('age').dataType('number')
    expectTypeOf(col).toMatchTypeOf<ProtectColumn>()
  })

  it('encryptedColumn().equality() returns ProtectColumn (for chaining)', () => {
    const col = encryptedColumn('email').equality()
    expectTypeOf(col).toMatchTypeOf<ProtectColumn>()
  })

  it('Decrypted<T> maps Encrypted fields to string', () => {
    type Model = { email: Encrypted; name: string }
    type Result = Decrypted<Model>
    expectTypeOf<Result>().toMatchTypeOf<{ email: string; name: string }>()
  })

  it('EncryptedFields<T> extracts only Encrypted fields', () => {
    type Model = { email: Encrypted; name: string; age: number }
    type Result = EncryptedFields<Model>
    expectTypeOf<Result>().toMatchTypeOf<{ email: Encrypted }>()
  })

  it('OtherFields<T> extracts non-Encrypted fields', () => {
    type Model = { email: Encrypted; name: string; age: number }
    type Result = OtherFields<Model>
    expectTypeOf<Result>().toMatchTypeOf<{ name: string; age: number }>()
  })

  it('DecryptedFields<T> maps Encrypted fields to string', () => {
    type Model = { email: Encrypted; name: string }
    type Result = DecryptedFields<Model>
    expectTypeOf<Result>().toMatchTypeOf<{ email: string }>()
  })

  it('KeysetIdentifier is a union of name or id', () => {
    expectTypeOf<{ name: string }>().toMatchTypeOf<KeysetIdentifier>()
    expectTypeOf<{ id: string }>().toMatchTypeOf<KeysetIdentifier>()
  })

  it('QueryTypeName includes expected values', () => {
    expectTypeOf<'equality'>().toMatchTypeOf<QueryTypeName>()
    expectTypeOf<'freeTextSearch'>().toMatchTypeOf<QueryTypeName>()
    expectTypeOf<'orderAndRange'>().toMatchTypeOf<QueryTypeName>()
    expectTypeOf<'searchableJson'>().toMatchTypeOf<QueryTypeName>()
    expectTypeOf<'steVecSelector'>().toMatchTypeOf<QueryTypeName>()
    expectTypeOf<'steVecTerm'>().toMatchTypeOf<QueryTypeName>()
  })

  it('EncryptedReturnType includes expected values', () => {
    expectTypeOf<'eql'>().toMatchTypeOf<EncryptedReturnType>()
    expectTypeOf<'composite-literal'>().toMatchTypeOf<EncryptedReturnType>()
    expectTypeOf<'escaped-composite-literal'>().toMatchTypeOf<EncryptedReturnType>()
  })

  it('InferPlaintext maps ProtectColumn keys to string', () => {
    const table = encryptedTable('users', {
      email: encryptedColumn('email'),
      name: encryptedColumn('name'),
    })
    type Plaintext = InferPlaintext<typeof table>
    expectTypeOf<Plaintext>().toMatchTypeOf<{ email: string; name: string }>()
  })

  it('InferEncrypted maps ProtectColumn keys to Encrypted', () => {
    const table = encryptedTable('users', {
      email: encryptedColumn('email'),
    })
    type Enc = InferEncrypted<typeof table>
    expectTypeOf<Enc>().toMatchTypeOf<{ email: Encrypted }>()
  })
})
