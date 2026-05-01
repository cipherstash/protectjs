import {
  encryptedBoolean,
  encryptedDate,
  encryptedJson,
  encryptedNumber,
  encryptedString,
} from '@/prisma/exports/column-types'
import { describe, expect, it } from 'vitest'

describe('encryptedString column factory', () => {
  it('emits a descriptor with the stable codec/native type identifiers', () => {
    const desc = encryptedString({ equality: true })

    expect(desc.codecId).toBe('cs/eql_v2_encrypted@1')
    expect(desc.nativeType).toBe('"public"."eql_v2_encrypted"')
  })

  it('projects the equality flag through typeParams while defaulting other modes to false', () => {
    const desc = encryptedString({ equality: true })

    expect(desc.typeParams).toEqual({
      dataType: 'string',
      equality: true,
      freeTextSearch: false,
      orderAndRange: false,
      searchableJson: false,
    })
  })

  it('projects the freeTextSearch flag through typeParams', () => {
    const desc = encryptedString({ equality: true, freeTextSearch: true })

    expect(desc.typeParams).toEqual({
      dataType: 'string',
      equality: true,
      freeTextSearch: true,
      orderAndRange: false,
      searchableJson: false,
    })
  })

  it('treats a missing config object as no searchable-encryption modes', () => {
    const desc = encryptedString()

    expect(desc.typeParams).toEqual({
      dataType: 'string',
      equality: false,
      freeTextSearch: false,
      orderAndRange: false,
      searchableJson: false,
    })
  })
})

describe('encryptedNumber column factory', () => {
  it('emits a number-typed encrypted column descriptor', () => {
    const desc = encryptedNumber({ orderAndRange: true })
    expect(desc.codecId).toBe('cs/eql_v2_encrypted@1')
    expect(desc.typeParams).toEqual({
      dataType: 'number',
      equality: false,
      freeTextSearch: false,
      orderAndRange: true,
      searchableJson: false,
    })
  })

  it('supports equality + orderAndRange together', () => {
    const desc = encryptedNumber({ equality: true, orderAndRange: true })
    expect(desc.typeParams.equality).toBe(true)
    expect(desc.typeParams.orderAndRange).toBe(true)
  })
})

describe('encryptedDate column factory', () => {
  it('emits a date-typed encrypted column descriptor', () => {
    const desc = encryptedDate({ orderAndRange: true })
    expect(desc.codecId).toBe('cs/eql_v2_encrypted@1')
    expect(desc.typeParams).toEqual({
      dataType: 'date',
      equality: false,
      freeTextSearch: false,
      orderAndRange: true,
      searchableJson: false,
    })
  })
})

describe('encryptedBoolean column factory', () => {
  it('emits a boolean-typed encrypted column descriptor', () => {
    const desc = encryptedBoolean({ equality: true })
    expect(desc.codecId).toBe('cs/eql_v2_encrypted@1')
    expect(desc.typeParams).toEqual({
      dataType: 'boolean',
      equality: true,
      freeTextSearch: false,
      orderAndRange: false,
      searchableJson: false,
    })
  })
})

describe('encryptedJson column factory', () => {
  it('emits a json-typed encrypted column descriptor', () => {
    type Profile = { name: string; bio: string }
    const desc = encryptedJson<Profile>({ searchableJson: true })
    expect(desc.codecId).toBe('cs/eql_v2_encrypted@1')
    expect(desc.typeParams).toEqual({
      dataType: 'json',
      equality: false,
      freeTextSearch: false,
      orderAndRange: false,
      searchableJson: true,
    })
  })

  it('defaults to all-false when no config is provided', () => {
    const desc = encryptedJson<{ a: number }>()
    expect(desc.typeParams).toEqual({
      dataType: 'json',
      equality: false,
      freeTextSearch: false,
      orderAndRange: false,
      searchableJson: false,
    })
  })
})

// ===========================================================================
// Type-level assertions: `OperationTypes` gating per `typeParams`.
//
// These checks compile or fail at build time — there is no runtime side.
// They cover the Phase 2 deliverables:
//   - `.eq()` / `.neq()` only when `equality === true`
//   - `.gt()` / `.gte()` / `.lt()` / `.lte()` / `.between()` / `.notBetween()`
//     only when `orderAndRange === true` AND `dataType ∈ {number, date}`
//   - `.like()` / `.ilike()` / `.notIlike()` only when `freeTextSearch === true`
//     AND `dataType === 'string'`
//   - `.jsonbPathExists()` / `.jsonbPathQueryFirst()` / `.jsonbGet()` only
//     when `searchableJson === true` AND `dataType === 'json'`
//   - argument JS-type per `typeParams.dataType` (Date for `'date'`,
//     number for `'number'`, etc.).
// ===========================================================================

import type { ENCRYPTED_STORAGE_CODEC_ID } from '@/prisma/core/constants'
import type { OperationTypes } from '@/prisma/exports/operation-types'

type StorageMethodsFor<TParams extends Record<string, unknown>> =
  OperationTypes<
    TParams & {
      readonly dataType: 'string' | 'number' | 'boolean' | 'date' | 'json'
      readonly equality: boolean
      readonly freeTextSearch: boolean
      readonly orderAndRange: boolean
      readonly searchableJson: boolean
    }
  >[typeof ENCRYPTED_STORAGE_CODEC_ID]

// ---- Equality gating ------------------------------------------------------
type StringEqOn = StorageMethodsFor<{
  dataType: 'string'
  equality: true
  freeTextSearch: false
  orderAndRange: false
  searchableJson: false
}>
type StringEqOff = StorageMethodsFor<{
  dataType: 'string'
  equality: false
  freeTextSearch: false
  orderAndRange: false
  searchableJson: false
}>

const _eqOn: 'eq' extends keyof StringEqOn ? true : never = true
const _neqOn: 'neq' extends keyof StringEqOn ? true : never = true
const _eqOff: 'eq' extends keyof StringEqOff ? never : true = true
const _gteOffByEquality: 'gte' extends keyof StringEqOn ? never : true = true
void _eqOn
void _neqOn
void _eqOff
void _gteOffByEquality

// ---- Range gating (orderAndRange + dataType ∈ {number, date}) -------------
type NumberOreOn = StorageMethodsFor<{
  dataType: 'number'
  equality: false
  freeTextSearch: false
  orderAndRange: true
  searchableJson: false
}>
type DateOreOn = StorageMethodsFor<{
  dataType: 'date'
  equality: false
  freeTextSearch: false
  orderAndRange: true
  searchableJson: false
}>
type StringOreOn = StorageMethodsFor<{
  // `orderAndRange: true` on a string column is semantically nonsensical, but
  // the column-type factory rejects it at the type level. We construct the
  // shape directly here only to assert the operation-types layer ALSO refuses
  // to surface ORE methods unless the dataType supports them.
  dataType: 'string'
  equality: false
  freeTextSearch: false
  orderAndRange: true
  searchableJson: false
}>

const _gteOnNumber: 'gte' extends keyof NumberOreOn ? true : never = true
const _gteOnDate: 'gte' extends keyof DateOreOn ? true : never = true
const _betweenOnNumber: 'between' extends keyof NumberOreOn ? true : never =
  true
const _gteOffString: 'gte' extends keyof StringOreOn ? never : true = true
void _gteOnNumber
void _gteOnDate
void _betweenOnNumber
void _gteOffString

// `.gte(param)` on a number column accepts `number`.
type GteArgsNumber = NumberOreOn['gte']['args'][0]['inputType']
const _gteArgNumber: GteArgsNumber extends number ? true : never = true
const _gteArgNumberRefusesString: string extends GteArgsNumber ? never : true =
  true
void _gteArgNumber
void _gteArgNumberRefusesString

// `.gte(param)` on a date column accepts `Date`.
type GteArgsDate = DateOreOn['gte']['args'][0]['inputType']
const _gteArgDate: GteArgsDate extends Date ? true : never = true
const _gteArgDateRefusesNumber: number extends GteArgsDate ? never : true = true
void _gteArgDate
void _gteArgDateRefusesNumber

// ---- Text search gating ---------------------------------------------------
type StringMatchOn = StorageMethodsFor<{
  dataType: 'string'
  equality: false
  freeTextSearch: true
  orderAndRange: false
  searchableJson: false
}>
type NumberMatchOn = StorageMethodsFor<{
  dataType: 'number'
  equality: false
  freeTextSearch: true
  orderAndRange: false
  searchableJson: false
}>

const _likeOnString: 'like' extends keyof StringMatchOn ? true : never = true
const _ilikeOnString: 'ilike' extends keyof StringMatchOn ? true : never = true
const _notIlikeOnString: 'notIlike' extends keyof StringMatchOn ? true : never =
  true
// Free-text on a non-string column is not surfaced (defense in depth — the
// column-type factory already rejects it; the operation-types layer mirrors
// that constraint).
const _likeOffNumber: 'like' extends keyof NumberMatchOn ? never : true = true
void _likeOnString
void _ilikeOnString
void _notIlikeOnString
void _likeOffNumber

// ---- JSON gating ----------------------------------------------------------
type JsonOn = StorageMethodsFor<{
  dataType: 'json'
  equality: false
  freeTextSearch: false
  orderAndRange: false
  searchableJson: true
}>
type JsonOff = StorageMethodsFor<{
  dataType: 'json'
  equality: false
  freeTextSearch: false
  orderAndRange: false
  searchableJson: false
}>

const _jsonbPathExistsOn: 'jsonbPathExists' extends keyof JsonOn
  ? true
  : never = true
const _jsonbPathQueryFirstOn: 'jsonbPathQueryFirst' extends keyof JsonOn
  ? true
  : never = true
const _jsonbGetOn: 'jsonbGet' extends keyof JsonOn ? true : never = true
const _jsonbPathExistsOff: 'jsonbPathExists' extends keyof JsonOff
  ? never
  : true = true
void _jsonbPathExistsOn
void _jsonbPathQueryFirstOn
void _jsonbGetOn
void _jsonbPathExistsOff
