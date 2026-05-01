import type { Decrypted } from '@/prisma/exports/codec-types'
import {
  encryptedBoolean,
  encryptedDate,
  encryptedJson,
  encryptedNumber,
  encryptedString,
} from '@/prisma/exports/column-types'
import { describe, it } from 'vitest'

/**
 * F-16: `Decrypted<Contract, Model>` type helper.
 *
 * Walks the contract's models, finds columns whose `codecId === 'cs/eql_v2_encrypted@1'`,
 * and infers the JS-side type from `typeParams.dataType` (string ->
 * string, number -> number, date -> Date, boolean -> boolean, json ->
 * the user's `T` from `encryptedJson<T>`).
 *
 * The helper has no runtime side; this file is a type-test only.
 */

// Synthetic contract shape for the helper — mirrors what the
// generated `contract.d.ts` emits for an encrypted-column-bearing
// model.
const contract = {
  models: {
    User: {
      fields: {
        // Plain integer ID — the helper widens unrelated columns to
        // `unknown` (the integration doesn't know the JS type for
        // non-encrypted columns; users can narrow themselves).
        id: { codecId: 'pg/int4@1' },
        email: encryptedString({ equality: true, freeTextSearch: true }),
        age: encryptedNumber({ orderAndRange: true }),
        isActive: encryptedBoolean({ equality: true }),
        createdAt: encryptedDate({ orderAndRange: true }),
        profile: encryptedJson<{ name: string; bio: string }>({
          searchableJson: true,
        }),
      },
    },
  },
} as const

// ---- Type-level assertions ------------------------------------------------

type DecryptedUser = Decrypted<typeof contract, 'User'>

// String-typed encrypted column → string
const _email: DecryptedUser['email'] = 'alice@example.com'
const _emailRefusesNumber: DecryptedUser['email'] extends number
  ? never
  : true = true

// Number-typed encrypted column → number
const _age: DecryptedUser['age'] = 30
const _ageRefusesString: DecryptedUser['age'] extends string ? never : true =
  true

// Boolean-typed encrypted column → boolean
const _isActive: DecryptedUser['isActive'] = true

// Date-typed encrypted column → Date
const _createdAt: DecryptedUser['createdAt'] = new Date()
const _createdAtRefusesString: DecryptedUser['createdAt'] extends string
  ? never
  : true = true

// JSON-typed encrypted column with explicit shape → that shape
const _profile: DecryptedUser['profile'] = { name: 'Alice', bio: 'Dev' }
// The shape is preserved verbatim — accessing typed fields works
// without any `as` cast.
function _checkProfileShape(p: DecryptedUser['profile']): void {
  // Both fields are typed as `string`.
  const _name: string = p.name
  const _bio: string = p.bio
  void _name
  void _bio
}

// Force the type-level assertions to materialize during compilation
void _email
void _emailRefusesNumber
void _age
void _ageRefusesString
void _isActive
void _createdAt
void _createdAtRefusesString
void _profile
void _checkProfileShape

// Runtime smoke test that compiles every assertion above.
describe('Decrypted<Contract, Model>', () => {
  it('compiles type-level assertions for every encrypted column data type', () => {
    // The body is intentionally trivial — the assertions live in
    // type space above. If the helper is wrong, this file fails to
    // compile.
  })
})
