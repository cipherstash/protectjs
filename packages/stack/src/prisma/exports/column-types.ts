import {
  ENCRYPTED_NATIVE_TYPE,
  ENCRYPTED_STORAGE_CODEC_ID,
  type EncryptedDataType,
} from '../core/constants'
import { JSON_SHAPE } from '../core/json-shape'
import type { ColumnTypeDescriptor } from '../internal-types/prisma-next'

/**
 * Common typeParams shape carried on every encrypted column descriptor.
 *
 * The four searchable-encryption flags are *always present* on the
 * descriptor (even when false) so the migration planner sees a uniform
 * shape and can diff configs per field without normalization. The literal
 * `dataType` discriminator drives `OperationTypes` argument-type resolution
 * (`.gte(param)` takes `number` for `dataType: 'number'`, `Date` for
 * `'date'`, etc.) and `CodecTypes` JS-side input/output type resolution.
 */
export interface EncryptedTypeParams<
  TDataType extends EncryptedDataType = EncryptedDataType,
> {
  readonly dataType: TDataType
  readonly equality: boolean
  readonly freeTextSearch: boolean
  readonly orderAndRange: boolean
  readonly searchableJson: boolean
}

// =============================================================================
// encryptedString
// =============================================================================

export interface EncryptedStringConfig {
  readonly equality?: boolean
  readonly freeTextSearch?: boolean
  // String columns have no natural ordering on EQL indexes; we keep the key
  // present in the type so configurations diff cleanly across factories,
  // but only `false` (or omission) is accepted.
  readonly orderAndRange?: false
  // Searchable JSON belongs to `encryptedJson`; reject it on string columns.
  readonly searchableJson?: false
}

export type EncryptedStringTypeParams = EncryptedTypeParams<'string'>

export interface EncryptedStringColumn<TConfig extends EncryptedStringConfig>
  extends ColumnTypeDescriptor<typeof ENCRYPTED_STORAGE_CODEC_ID> {
  readonly codecId: typeof ENCRYPTED_STORAGE_CODEC_ID
  readonly nativeType: typeof ENCRYPTED_NATIVE_TYPE
  readonly typeParams: {
    readonly dataType: 'string'
    readonly equality: TConfig['equality'] extends true ? true : false
    readonly freeTextSearch: TConfig['freeTextSearch'] extends true
      ? true
      : false
    readonly orderAndRange: false
    readonly searchableJson: false
  }
}

/**
 * Encrypted string column descriptor.
 *
 * @example
 *   email: field.column(encryptedString({ equality: true, freeTextSearch: true }))
 */
export function encryptedString<const TConfig extends EncryptedStringConfig>(
  config: TConfig = {} as TConfig,
): EncryptedStringColumn<TConfig> {
  const typeParams = {
    dataType: 'string',
    equality: config.equality === true,
    freeTextSearch: config.freeTextSearch === true,
    orderAndRange: false,
    searchableJson: false,
  } as EncryptedStringColumn<TConfig>['typeParams']

  return {
    codecId: ENCRYPTED_STORAGE_CODEC_ID,
    nativeType: ENCRYPTED_NATIVE_TYPE,
    typeParams,
  }
}

// =============================================================================
// encryptedNumber
// =============================================================================

export interface EncryptedNumberConfig {
  readonly equality?: boolean
  readonly orderAndRange?: boolean
  readonly freeTextSearch?: false
  readonly searchableJson?: false
}

export type EncryptedNumberTypeParams = EncryptedTypeParams<'number'>

export interface EncryptedNumberColumn<TConfig extends EncryptedNumberConfig>
  extends ColumnTypeDescriptor<typeof ENCRYPTED_STORAGE_CODEC_ID> {
  readonly codecId: typeof ENCRYPTED_STORAGE_CODEC_ID
  readonly nativeType: typeof ENCRYPTED_NATIVE_TYPE
  readonly typeParams: {
    readonly dataType: 'number'
    readonly equality: TConfig['equality'] extends true ? true : false
    readonly freeTextSearch: false
    readonly orderAndRange: TConfig['orderAndRange'] extends true ? true : false
    readonly searchableJson: false
  }
}

/**
 * Encrypted numeric column descriptor.
 *
 * @example
 *   age: field.column(encryptedNumber({ orderAndRange: true }))
 */
export function encryptedNumber<const TConfig extends EncryptedNumberConfig>(
  config: TConfig = {} as TConfig,
): EncryptedNumberColumn<TConfig> {
  const typeParams = {
    dataType: 'number',
    equality: config.equality === true,
    freeTextSearch: false,
    orderAndRange: config.orderAndRange === true,
    searchableJson: false,
  } as EncryptedNumberColumn<TConfig>['typeParams']

  return {
    codecId: ENCRYPTED_STORAGE_CODEC_ID,
    nativeType: ENCRYPTED_NATIVE_TYPE,
    typeParams,
  }
}

// =============================================================================
// encryptedDate
// =============================================================================

export interface EncryptedDateConfig {
  readonly equality?: boolean
  readonly orderAndRange?: boolean
  readonly freeTextSearch?: false
  readonly searchableJson?: false
}

export type EncryptedDateTypeParams = EncryptedTypeParams<'date'>

export interface EncryptedDateColumn<TConfig extends EncryptedDateConfig>
  extends ColumnTypeDescriptor<typeof ENCRYPTED_STORAGE_CODEC_ID> {
  readonly codecId: typeof ENCRYPTED_STORAGE_CODEC_ID
  readonly nativeType: typeof ENCRYPTED_NATIVE_TYPE
  readonly typeParams: {
    readonly dataType: 'date'
    readonly equality: TConfig['equality'] extends true ? true : false
    readonly freeTextSearch: false
    readonly orderAndRange: TConfig['orderAndRange'] extends true ? true : false
    readonly searchableJson: false
  }
}

/**
 * Encrypted date/timestamp column descriptor.
 *
 * The JS-side type is `Date`; the codec serializes Date instances to ISO
 * strings for the FFI's `cast_as: 'date'` round-trip and rehydrates back
 * to a `Date` on `decode`.
 *
 * @example
 *   createdAt: field.column(encryptedDate({ orderAndRange: true }))
 */
export function encryptedDate<const TConfig extends EncryptedDateConfig>(
  config: TConfig = {} as TConfig,
): EncryptedDateColumn<TConfig> {
  const typeParams = {
    dataType: 'date',
    equality: config.equality === true,
    freeTextSearch: false,
    orderAndRange: config.orderAndRange === true,
    searchableJson: false,
  } as EncryptedDateColumn<TConfig>['typeParams']

  return {
    codecId: ENCRYPTED_STORAGE_CODEC_ID,
    nativeType: ENCRYPTED_NATIVE_TYPE,
    typeParams,
  }
}

// =============================================================================
// encryptedBoolean
// =============================================================================

export interface EncryptedBooleanConfig {
  readonly equality?: boolean
  readonly freeTextSearch?: false
  readonly orderAndRange?: false
  readonly searchableJson?: false
}

export type EncryptedBooleanTypeParams = EncryptedTypeParams<'boolean'>

export interface EncryptedBooleanColumn<TConfig extends EncryptedBooleanConfig>
  extends ColumnTypeDescriptor<typeof ENCRYPTED_STORAGE_CODEC_ID> {
  readonly codecId: typeof ENCRYPTED_STORAGE_CODEC_ID
  readonly nativeType: typeof ENCRYPTED_NATIVE_TYPE
  readonly typeParams: {
    readonly dataType: 'boolean'
    readonly equality: TConfig['equality'] extends true ? true : false
    readonly freeTextSearch: false
    readonly orderAndRange: false
    readonly searchableJson: false
  }
}

/**
 * Encrypted boolean column descriptor.
 *
 * Booleans only support equality search — there's no useful ordering or
 * substring search on a two-element domain.
 *
 * @example
 *   isActive: field.column(encryptedBoolean({ equality: true }))
 */
export function encryptedBoolean<const TConfig extends EncryptedBooleanConfig>(
  config: TConfig = {} as TConfig,
): EncryptedBooleanColumn<TConfig> {
  const typeParams = {
    dataType: 'boolean',
    equality: config.equality === true,
    freeTextSearch: false,
    orderAndRange: false,
    searchableJson: false,
  } as EncryptedBooleanColumn<TConfig>['typeParams']

  return {
    codecId: ENCRYPTED_STORAGE_CODEC_ID,
    nativeType: ENCRYPTED_NATIVE_TYPE,
    typeParams,
  }
}

// =============================================================================
// encryptedJson
// =============================================================================

export interface EncryptedJsonConfig {
  readonly equality?: boolean
  readonly searchableJson?: boolean
  readonly freeTextSearch?: false
  readonly orderAndRange?: false
}

export type EncryptedJsonTypeParams = EncryptedTypeParams<'json'>

/**
 * Phantom slot carrying the user's JSON shape so `Decrypted<T>` can
 * surface `T` rather than `unknown` on the read path. The shape is
 * never present at runtime; it only exists in the type system.
 */
export interface EncryptedJsonColumn<
  TShape,
  TConfig extends EncryptedJsonConfig,
> extends ColumnTypeDescriptor<typeof ENCRYPTED_STORAGE_CODEC_ID> {
  readonly codecId: typeof ENCRYPTED_STORAGE_CODEC_ID
  readonly nativeType: typeof ENCRYPTED_NATIVE_TYPE
  readonly typeParams: {
    readonly dataType: 'json'
    readonly equality: TConfig['equality'] extends true ? true : false
    readonly freeTextSearch: false
    readonly orderAndRange: false
    readonly searchableJson: TConfig['searchableJson'] extends true
      ? true
      : false
  }
  readonly [JSON_SHAPE]?: TShape
}

/**
 * Encrypted searchable-JSON column descriptor.
 *
 * Pass the typed JSON shape as the type argument; the descriptor carries
 * it forward so `Decrypted<Contract, Model>` resolves the JS-side type to
 * `T` rather than `unknown`. The wire round-trip is plain `JSON.parse` /
 * `JSON.stringify`.
 *
 * @example
 *   profile: field.column(
 *     encryptedJson<{ name: string; bio: string }>({ searchableJson: true }),
 *   )
 */
export function encryptedJson<
  TShape = unknown,
  const TConfig extends EncryptedJsonConfig = EncryptedJsonConfig,
>(config: TConfig = {} as TConfig): EncryptedJsonColumn<TShape, TConfig> {
  const typeParams = {
    dataType: 'json',
    equality: config.equality === true,
    freeTextSearch: false,
    orderAndRange: false,
    searchableJson: config.searchableJson === true,
  } as EncryptedJsonColumn<TShape, TConfig>['typeParams']

  return {
    codecId: ENCRYPTED_STORAGE_CODEC_ID,
    nativeType: ENCRYPTED_NATIVE_TYPE,
    typeParams,
  }
}
