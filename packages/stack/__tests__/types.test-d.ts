import { describe, expectTypeOf, it } from 'vitest'
import { encryptedColumn, encryptedTable } from '@/schema'
import type {
  InferEncrypted,
  InferPlaintext,
  EncryptedColumn,
  EncryptedTable,
  EncryptedTableColumn,
  EncryptedField,
} from '@/schema'
import type {
  Decrypted,
  DecryptedFields,
  Encrypted,
  EncryptedFields,
  EncryptedFromContract,
  EncryptedReturnType,
  KeysetIdentifier,
  OtherFields,
  QueryTypeName,
} from '@/types'
import { defineContract, encrypted } from '@/contract'
import type {
  ContractColumnRef,
  ContractTableRef,
  ColumnConfig,
  TableColumns,
} from '@/contract'
import type { EncryptionClient } from '@/encryption'

describe('Type inference', () => {
  it('encryptedTable returns ProtectTable with column access', () => {
    const table = encryptedTable('users', {
      email: encryptedColumn('email'),
    })
    expectTypeOf(table.email).toMatchTypeOf<EncryptedColumn>()
    expectTypeOf(table.tableName).toBeString()
  })

  it('encryptedTable is also a ProtectTable', () => {
    const table = encryptedTable('users', {
      email: encryptedColumn('email'),
    })
    expectTypeOf(table).toMatchTypeOf<
      EncryptedTable<{ email: EncryptedColumn }>
    >()
  })

  it('encryptedColumn returns ProtectColumn', () => {
    const col = encryptedColumn('email')
    expectTypeOf(col).toMatchTypeOf<EncryptedColumn>()
  })

  it('encryptedColumn().dataType() returns ProtectColumn (for chaining)', () => {
    const col = encryptedColumn('age').dataType('number')
    expectTypeOf(col).toMatchTypeOf<EncryptedColumn>()
  })

  it('encryptedColumn().equality() returns ProtectColumn (for chaining)', () => {
    const col = encryptedColumn('email').equality()
    expectTypeOf(col).toMatchTypeOf<EncryptedColumn>()
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

  it('EncryptedFromContract maps contract fields to Encrypted, leaves others unchanged', () => {
    type User = { id: string; email: string; createdAt: Date }
    type Cols = { email: { type: 'string'; equality: true } }
    type Result = EncryptedFromContract<User, Cols>
    expectTypeOf<Result>().toEqualTypeOf<{
      id: string
      email: Encrypted
      createdAt: Date
    }>()
  })

  it('EncryptedFromContract with widened TableColumns degrades to T', () => {
    type User = { id: string; email: string }
    type Result = EncryptedFromContract<User, TableColumns>
    // When C is the wide TableColumns, C[K] is the full union, not ColumnConfig alone.
    // The conditional [C[K]] extends [ColumnConfig] fails, so fields stay as-is.
    expectTypeOf<Result>().toEqualTypeOf<{ id: string; email: string }>()
  })

  it('Decrypted reverses EncryptedFromContract correctly', () => {
    type User = { id: string; email: string; createdAt: Date }
    type Cols = { email: { type: 'string'; equality: true } }
    type EncryptedUser = EncryptedFromContract<User, Cols>
    type DecryptedUser = Decrypted<EncryptedUser>
    expectTypeOf<DecryptedUser>().toMatchTypeOf<{
      id: string
      email: string
      createdAt: Date
    }>()
  })

  it('encryptModel infers contract-aware return types from table argument', async () => {
    const contract = defineContract({
      users: {
        name: encrypted({ type: 'string', equality: true }),
        email: encrypted({ type: 'string', freeTextSearch: true }),
      },
    })

    const client = {} as EncryptionClient

    const result = await client.encryptModel(
      { name: 'John', email: 'john@example.com', age: 30 },
      contract.users,
    )

    if (!result.failure) {
      // Contract fields should be Encrypted
      expectTypeOf(result.data.name).toEqualTypeOf<Encrypted>()
      expectTypeOf(result.data.email).toEqualTypeOf<Encrypted>()
      // Non-contract fields should keep their original type
      expectTypeOf(result.data.age).toEqualTypeOf<number>()
    }
  })
})
