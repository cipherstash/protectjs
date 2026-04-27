/**
 * Conditional operation types for encrypted columns.
 *
 * Phase 2 adds full gating: `.eq()` / `.neq()` only on equality columns,
 * `.gt()` / `.gte()` / `.lt()` / `.lte()` / `.between()` / `.notBetween()`
 * only on `orderAndRange` columns, `.like()` / `.ilike()` / `.notIlike()`
 * only on `freeTextSearch` columns, `.jsonbPathExists()` / `jsonbPathQueryFirst`
 * / `jsonbGet` only on `searchableJson` columns. The argument JS-type is
 * dispatched off `typeParams.dataType` (e.g. `.gte(param)` takes `Date` for
 * an `encryptedDate` column and `number` for `encryptedNumber`).
 *
 * The framework's `contract.d.ts` emitter consumes the `OperationTypes`
 * named export to attach methods onto the corresponding column accessor in
 * `db.orm.<Model>.where(u => u.<col>.<method>(...))`. This file matches
 * pgvector's `OperationTypes` shape one-for-one for structural fidelity.
 */

import type {
  ENCRYPTED_EQ_TERM_CODEC_ID,
  ENCRYPTED_MATCH_TERM_CODEC_ID,
  ENCRYPTED_ORE_TERM_CODEC_ID,
  ENCRYPTED_STE_VEC_SELECTOR_CODEC_ID,
  ENCRYPTED_STORAGE_CODEC_ID,
  EncryptedDataType,
} from '../core/constants'
import type { EncryptedTypeParams } from './column-types'

// ---------------------------------------------------------------------------
// Trait gates — compile-time predicates over the column's typeParams.
// ---------------------------------------------------------------------------

type HasEquality<T> = T extends { readonly equality: true } ? true : false
type HasFreeTextSearch<T> = T extends { readonly freeTextSearch: true }
  ? true
  : false
type HasOrderAndRange<T> = T extends { readonly orderAndRange: true }
  ? true
  : false
type HasSearchableJson<T> = T extends { readonly searchableJson: true }
  ? true
  : false

// ---------------------------------------------------------------------------
// dataType-driven JS-side argument typing.
// ---------------------------------------------------------------------------

/**
 * Map a `dataType` literal to the JS-side argument type accepted by an
 * operator's value-side parameter. `.gte(x)` on an `encryptedDate` column
 * takes `Date`; on `encryptedNumber` it takes `number`. JSON columns
 * surface `unknown` because their typed shape lives on the column
 * descriptor's phantom slot, not in `typeParams`.
 */
type ArgTypeFor<TDataType extends EncryptedDataType> =
  TDataType extends 'string'
    ? string
    : TDataType extends 'number'
      ? number
      : TDataType extends 'boolean'
        ? boolean
        : TDataType extends 'date'
          ? Date
          : TDataType extends 'json'
            ? unknown
            : never

// ---------------------------------------------------------------------------
// Per-method argument specs. Each spec mirrors what's emitted from the
// runtime extension's operator descriptor in `core/operation-templates.ts`.
// We don't redeclare lowering templates here — the emitter only inspects
// `args` / `returns`.
// ---------------------------------------------------------------------------

type EqArgSpec<TDataType extends EncryptedDataType> = {
  readonly args: readonly [
    {
      readonly codecId: typeof ENCRYPTED_EQ_TERM_CODEC_ID
      readonly nullable: false
      readonly inputType: ArgTypeFor<TDataType>
    },
  ]
  readonly returns: {
    readonly codecId: 'core/bool@1'
    readonly nullable: false
  }
  readonly lowering: {
    readonly targetFamily: 'sql'
    readonly strategy: 'function'
    readonly template: string
  }
}

type OreArgSpec<TDataType extends EncryptedDataType> = {
  readonly args: readonly [
    {
      readonly codecId: typeof ENCRYPTED_ORE_TERM_CODEC_ID
      readonly nullable: false
      readonly inputType: ArgTypeFor<TDataType>
    },
  ]
  readonly returns: {
    readonly codecId: 'core/bool@1'
    readonly nullable: false
  }
  readonly lowering: {
    readonly targetFamily: 'sql'
    readonly strategy: 'function'
    readonly template: string
  }
}

type BetweenArgSpec<TDataType extends EncryptedDataType> = {
  readonly args: readonly [
    {
      readonly codecId: typeof ENCRYPTED_ORE_TERM_CODEC_ID
      readonly nullable: false
      readonly inputType: ArgTypeFor<TDataType>
    },
    {
      readonly codecId: typeof ENCRYPTED_ORE_TERM_CODEC_ID
      readonly nullable: false
      readonly inputType: ArgTypeFor<TDataType>
    },
  ]
  readonly returns: {
    readonly codecId: 'core/bool@1'
    readonly nullable: false
  }
  readonly lowering: {
    readonly targetFamily: 'sql'
    readonly strategy: 'function'
    readonly template: string
  }
}

type MatchArgSpec = {
  readonly args: readonly [
    {
      readonly codecId: typeof ENCRYPTED_MATCH_TERM_CODEC_ID
      readonly nullable: false
      readonly inputType: string
    },
  ]
  readonly returns: {
    readonly codecId: 'core/bool@1'
    readonly nullable: false
  }
  readonly lowering: {
    readonly targetFamily: 'sql'
    readonly strategy: 'function'
    readonly template: string
  }
}

type SteVecBoolArgSpec = {
  readonly args: readonly [
    {
      readonly codecId: typeof ENCRYPTED_STE_VEC_SELECTOR_CODEC_ID
      readonly nullable: false
      readonly inputType: string
    },
  ]
  readonly returns: {
    readonly codecId: 'core/bool@1'
    readonly nullable: false
  }
  readonly lowering: {
    readonly targetFamily: 'sql'
    readonly strategy: 'function'
    readonly template: string
  }
}

type SteVecStorageArgSpec = {
  readonly args: readonly [
    {
      readonly codecId: typeof ENCRYPTED_STE_VEC_SELECTOR_CODEC_ID
      readonly nullable: false
      readonly inputType: string
    },
  ]
  readonly returns: {
    readonly codecId: typeof ENCRYPTED_STORAGE_CODEC_ID
    readonly nullable: true
  }
  readonly lowering: {
    readonly targetFamily: 'sql'
    readonly strategy: 'function' | 'infix'
    readonly template: string
  }
}

// ---------------------------------------------------------------------------
// Conditional method bags. Each bag emits zero-or-more keys depending on
// the corresponding `typeParams` flag. Empty branches produce
// `Record<never, never>`, which the framework's emitter treats as "no
// methods of this kind".
// ---------------------------------------------------------------------------

type EqualityMethods<TParams extends EncryptedTypeParams> =
  HasEquality<TParams> extends true
    ? {
        readonly eq: EqArgSpec<TParams['dataType']>
        readonly neq: EqArgSpec<TParams['dataType']>
      }
    : Record<never, never>

type RangeMethods<TParams extends EncryptedTypeParams> =
  HasOrderAndRange<TParams> extends true
    ? TParams['dataType'] extends 'number' | 'date'
      ? {
          readonly gt: OreArgSpec<TParams['dataType']>
          readonly gte: OreArgSpec<TParams['dataType']>
          readonly lt: OreArgSpec<TParams['dataType']>
          readonly lte: OreArgSpec<TParams['dataType']>
          readonly between: BetweenArgSpec<TParams['dataType']>
          readonly notBetween: BetweenArgSpec<TParams['dataType']>
        }
      : Record<never, never>
    : Record<never, never>

type TextMethods<TParams extends EncryptedTypeParams> =
  HasFreeTextSearch<TParams> extends true
    ? TParams['dataType'] extends 'string'
      ? {
          readonly like: MatchArgSpec
          readonly ilike: MatchArgSpec
          readonly notIlike: MatchArgSpec
        }
      : Record<never, never>
    : Record<never, never>

type JsonMethods<TParams extends EncryptedTypeParams> =
  HasSearchableJson<TParams> extends true
    ? TParams['dataType'] extends 'json'
      ? {
          readonly jsonbPathExists: SteVecBoolArgSpec
          readonly jsonbPathQueryFirst: SteVecStorageArgSpec
          readonly jsonbGet: SteVecStorageArgSpec
        }
      : Record<never, never>
    : Record<never, never>

/**
 * Combined storage-codec method bag. Intersection-merge over the four
 * trait-gated bags so the generated column accessor exposes every
 * applicable method without overlap (the bags share no keys by
 * construction).
 */
type StorageMethods<TParams extends EncryptedTypeParams> =
  EqualityMethods<TParams> &
    RangeMethods<TParams> &
    TextMethods<TParams> &
    JsonMethods<TParams>

/**
 * Public `OperationTypes` map keyed by codec ID. Pgvector keys this map
 * by codec ID; we do the same. The value is parameterized by `TParams`
 * so the emitter can specialize per-column instead of advertising every
 * method on every encrypted column.
 *
 * The four query-term codecs are write-only and don't surface user-facing
 * methods, so they aren't keyed in this map.
 */
export type OperationTypes<
  TParams extends EncryptedTypeParams = EncryptedTypeParams,
> = {
  readonly [ENCRYPTED_STORAGE_CODEC_ID]: StorageMethods<TParams>
}
