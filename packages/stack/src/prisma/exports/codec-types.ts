/**
 * Type-only emission targets for `@cipherstash/stack/prisma`.
 *
 * Imported from generated `contract.d.ts` files at build time. Runtime
 * imports go through `./runtime` and `./pack`.
 */

import type {
  ENCRYPTED_EQ_TERM_CODEC_ID,
  ENCRYPTED_MATCH_TERM_CODEC_ID,
  ENCRYPTED_ORE_TERM_CODEC_ID,
  ENCRYPTED_STE_VEC_SELECTOR_CODEC_ID,
  ENCRYPTED_STORAGE_CODEC_ID,
  EncryptedDataType,
} from '../core/constants'
import type { JSON_SHAPE } from '../core/json-shape'

/**
 * Map a `dataType` literal to the JS-side type produced by an encrypted
 * column on read/write paths. The dataType is read off the column's
 * `typeParams` discriminator at type-emission time, so the generated
 * `contract.d.ts` produces `string | number | boolean | Date | <Shape>`
 * exactly as the user authored.
 *
 * For `dataType: 'json'`, the `TJsonShape` type parameter carries the
 * shape supplied via `encryptedJson<T>(...)`. The phantom slot on the
 * column descriptor (`__jsonShape`) propagates `T` from authoring
 * through to the `Decrypted<Contract, Model>` helper below.
 */
export type JsTypeFor<
  TDataType extends EncryptedDataType,
  TJsonShape = unknown,
> = TDataType extends 'string'
  ? string
  : TDataType extends 'number'
    ? number
    : TDataType extends 'boolean'
      ? boolean
      : TDataType extends 'date'
        ? Date
        : TDataType extends 'json'
          ? TJsonShape
          : never

/**
 * Codec input/output types keyed by codec ID. The storage codec's
 * input/output is parameterized by `dataType` (driven by the column's
 * `typeParams`); the query-term codecs are write-only and parameterized
 * to the JS shape the operator surface accepts.
 *
 * The contract emitter consumes this map by codec ID — the same way
 * pgvector's `CodecTypes` is consumed — and substitutes the JS-side
 * type into the generated model definitions.
 */
export type CodecTypes<
  TDataType extends EncryptedDataType = EncryptedDataType,
> = {
  readonly [ENCRYPTED_STORAGE_CODEC_ID]: {
    readonly input: JsTypeFor<TDataType>
    readonly output: JsTypeFor<TDataType>
    readonly traits: 'equality'
  }
  readonly [ENCRYPTED_EQ_TERM_CODEC_ID]: {
    readonly input: JsTypeFor<TDataType>
    readonly output: never
    readonly traits: never
  }
  readonly [ENCRYPTED_MATCH_TERM_CODEC_ID]: {
    readonly input: string
    readonly output: never
    readonly traits: never
  }
  readonly [ENCRYPTED_ORE_TERM_CODEC_ID]: {
    readonly input: number | Date
    readonly output: never
    readonly traits: never
  }
  readonly [ENCRYPTED_STE_VEC_SELECTOR_CODEC_ID]: {
    readonly input: string
    readonly output: never
    readonly traits: never
  }
}

// ---------------------------------------------------------------------------
// Decrypted<Contract, Model> — public type helper for users typing
// function signatures around decrypted rows.
// ---------------------------------------------------------------------------

/**
 * Minimal column shape consumed by `Decrypted<...>` — the codec ID
 * and structured `typeParams.dataType` are enough to resolve the
 * decrypted JS type per column.
 *
 * The phantom `[JSON_SHAPE]` slot is the same symbol used by
 * `encryptedJson<T>(...)` (see `core/json-shape.ts`), so `T`
 * propagates from authoring through to the helper without any cast.
 */
type DecryptedColumnShape = {
  readonly codecId?: string
  readonly typeParams?: {
    readonly dataType?: EncryptedDataType
    readonly [k: string]: unknown
  }
  // Phantom shape from `encryptedJson<T>(...)` — picked up at the
  // type level, never present at runtime.
  readonly [JSON_SHAPE]?: unknown
}

/**
 * Resolve the JS-side type for an encrypted column. Walks
 * `typeParams.dataType` and, for JSON columns, prefers the phantom
 * `__jsonShape` slot — falling back to `unknown` only when the user
 * authored `encryptedJson({...})` without a type argument.
 */
type ResolveDecryptedType<TColumn> = TColumn extends DecryptedColumnShape
  ? TColumn['codecId'] extends typeof ENCRYPTED_STORAGE_CODEC_ID
    ? TColumn['typeParams'] extends { readonly dataType: infer TDataType }
      ? TDataType extends 'json'
        ? // Strip `undefined` (the slot is optional at the type level
          // because authoring never sets a runtime value for it). When
          // the column was authored with `encryptedJson<T>(...)`,
          // `Exclude<...>` narrows back to `T`; when authored without
          // a type argument, the slot is `unknown` and we surface
          // `unknown` to the user.
          Exclude<TColumn[typeof JSON_SHAPE], undefined> extends infer TShape
          ? unknown extends TShape
            ? unknown
            : TShape
          : unknown
        : TDataType extends EncryptedDataType
          ? JsTypeFor<TDataType>
          : never
      : never
    : never
  : never

/**
 * Resolve a single field's JS-side type. Encrypted columns surface
 * their decrypted type; unrelated columns fall back to a permissive
 * `unknown` (since we can only read this contract via its narrow
 * structural slice — the integration doesn't pretend to know the JS
 * type for non-encrypted columns).
 */
type ResolveFieldType<TField> = TField extends DecryptedColumnShape
  ? TField['codecId'] extends typeof ENCRYPTED_STORAGE_CODEC_ID
    ? ResolveDecryptedType<TField>
    : unknown
  : unknown

/**
 * Minimal Prisma Next contract shape consumed by `Decrypted`.
 *
 * The contract has many more fields; we only consume what we need to
 * walk `models[Model].fields[FieldName]`. Authoring-time
 * `encryptedString({...})` / `encryptedNumber({...})` / etc.
 * descriptors live at this position.
 */
export type DecryptedContractShape = {
  readonly models?: {
    readonly [modelName: string]: {
      readonly fields?: {
        readonly [fieldName: string]: unknown
      }
    }
  }
}

/**
 * Walk a contract's model and return a row shape with encrypted
 * fields narrowed to their decrypted JS types.
 *
 * Useful for users who want to type their function signatures around
 * decrypted rows:
 *
 * ```ts
 * import type { Decrypted } from '@cipherstash/stack/prisma/codec-types'
 * import { contract } from './contract'
 *
 * type DecryptedUser = Decrypted<typeof contract, 'User'>
 *
 * function welcome(user: DecryptedUser) {
 *   console.log(user.email.toLowerCase())     // string
 *   console.log(user.profile.name)            // typed via encryptedJson<T>
 * }
 * ```
 */
export type Decrypted<
  TContract extends DecryptedContractShape,
  TModel extends keyof NonNullable<TContract['models']>,
> = TContract['models'] extends infer TModels
  ? TModels extends {
      readonly [K in TModel]: { readonly fields?: infer TFields }
    }
    ? TFields extends Record<string, unknown>
      ? {
          [K in keyof TFields]: ResolveFieldType<TFields[K]>
        }
      : never
    : never
  : never
