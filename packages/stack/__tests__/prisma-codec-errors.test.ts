import { createEncryptedEqTermCodec } from '@/prisma/core/codec-eq-term'
import { createEncryptedMatchTermCodec } from '@/prisma/core/codec-match-term'
import { createEncryptedOreTermCodec } from '@/prisma/core/codec-ore-term'
import { createEncryptedSteVecSelectorCodec } from '@/prisma/core/codec-ste-vec-term'
import { createEncryptedStorageCodec } from '@/prisma/core/codec-storage'
import {
  CipherStashCodecError,
  assertJsTypeMatchesDataType,
  inferJsDataType,
} from '@/prisma/core/errors'
import { describe, expect, it } from 'vitest'
import {
  createMockEncryptionClient,
  createTestCodecContext,
} from './prisma-test-helpers'

/**
 * Encode-time JS-runtime guards.
 *
 * Unsupported JS types (`bigint`, `symbol`, `function`) raise
 * `UNSUPPORTED_PLAINTEXT_TYPE`. Mismatches between the value's runtime
 * type and an explicitly-supplied expected `dataType` raise
 * `JS_TYPE_MISMATCH`.
 */

describe('inferJsDataType', () => {
  it('maps each supported JS type to the corresponding EncryptedDataType', () => {
    expect(inferJsDataType('a')).toBe('string')
    expect(inferJsDataType(42)).toBe('number')
    expect(inferJsDataType(true)).toBe('boolean')
    expect(inferJsDataType(new Date())).toBe('date')
    expect(inferJsDataType({ a: 1 })).toBe('json')
    expect(inferJsDataType([1, 2])).toBe('json')
  })

  it('returns undefined for unsupported runtime types', () => {
    expect(inferJsDataType(1n)).toBeUndefined()
    expect(inferJsDataType(Symbol('s'))).toBeUndefined()
    expect(inferJsDataType(() => 0)).toBeUndefined()
    expect(inferJsDataType(undefined)).toBeUndefined()
    // null is `typeof === 'object'` so this looks like a supported
    // type but isn't useful in practice — null is filtered upstream.
    expect(inferJsDataType(null)).toBe('json')
  })
})

describe('assertJsTypeMatchesDataType', () => {
  it('returns the JS-derived dataType for supported values', () => {
    expect(assertJsTypeMatchesDataType('a', undefined)).toBe('string')
    expect(assertJsTypeMatchesDataType(42, undefined)).toBe('number')
    expect(assertJsTypeMatchesDataType(true, undefined)).toBe('boolean')
    expect(assertJsTypeMatchesDataType(new Date(), undefined)).toBe('date')
    expect(assertJsTypeMatchesDataType({ a: 1 }, undefined)).toBe('json')
  })

  it('throws UNSUPPORTED_PLAINTEXT_TYPE for out-of-set JS types', () => {
    let err: unknown
    try {
      assertJsTypeMatchesDataType(1n, undefined)
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(CipherStashCodecError)
    if (err instanceof CipherStashCodecError) {
      expect(err.code).toBe('UNSUPPORTED_PLAINTEXT_TYPE')
      expect(err.actualType).toBe('bigint')
      expect(err.expectedDataType).toBeUndefined()
    }
  })

  it('throws JS_TYPE_MISMATCH when JS type does not match the expected dataType', () => {
    let err: unknown
    try {
      assertJsTypeMatchesDataType(42, 'string', 'email')
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(CipherStashCodecError)
    if (err instanceof CipherStashCodecError) {
      expect(err.code).toBe('JS_TYPE_MISMATCH')
      expect(err.column).toBe('email')
      expect(err.expectedDataType).toBe('string')
      expect(err.actualType).toBe('number')
      expect(err.message).toContain('email')
      expect(err.message).toContain('string')
      expect(err.message).toContain('number')
    }
  })

  it('accepts a matching expected dataType', () => {
    expect(assertJsTypeMatchesDataType('a', 'string', 'email')).toBe('string')
    expect(assertJsTypeMatchesDataType(42, 'number', 'age')).toBe('number')
    expect(assertJsTypeMatchesDataType(true, 'boolean', 'isActive')).toBe(
      'boolean',
    )
    expect(assertJsTypeMatchesDataType(new Date(), 'date', 'createdAt')).toBe(
      'date',
    )
    expect(assertJsTypeMatchesDataType({}, 'json', 'profile')).toBe('json')
  })
})

// =============================================================================
// Codec-level encode-time guard behavior
// =============================================================================

describe('encryptedStorageCodec encode guard', () => {
  it('rejects bigint plaintexts with a structured CipherStashCodecError', async () => {
    const { client } = createMockEncryptionClient()
    const ctx = createTestCodecContext({ client })
    const codec = createEncryptedStorageCodec(ctx)

    let err: unknown
    try {
      await codec.encode(1n)
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(CipherStashCodecError)
    if (err instanceof CipherStashCodecError) {
      expect(err.code).toBe('UNSUPPORTED_PLAINTEXT_TYPE')
      expect(err.actualType).toBe('bigint')
    }
  })

  it('rejects symbol plaintexts with a structured CipherStashCodecError', async () => {
    const { client } = createMockEncryptionClient()
    const ctx = createTestCodecContext({ client })
    const codec = createEncryptedStorageCodec(ctx)

    let err: unknown
    try {
      await codec.encode(Symbol('s'))
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(CipherStashCodecError)
    if (err instanceof CipherStashCodecError) {
      expect(err.code).toBe('UNSUPPORTED_PLAINTEXT_TYPE')
      expect(err.actualType).toBe('symbol')
    }
  })

  it('rejects function plaintexts with a structured CipherStashCodecError', async () => {
    const { client } = createMockEncryptionClient()
    const ctx = createTestCodecContext({ client })
    const codec = createEncryptedStorageCodec(ctx)

    await expect(codec.encode(() => 0)).rejects.toBeInstanceOf(
      CipherStashCodecError,
    )
  })

  it('accepts every supported JS type and produces a valid wire string', async () => {
    const { client } = createMockEncryptionClient()
    const ctx = createTestCodecContext({ client })
    const codec = createEncryptedStorageCodec(ctx)

    const cases: ReadonlyArray<unknown> = [
      'string-value',
      42,
      true,
      new Date('2026-01-01T00:00:00.000Z'),
      { name: 'Alice' },
    ]
    for (const v of cases) {
      const wire = await codec.encode(v)
      expect(typeof wire).toBe('string')
      expect(wire.startsWith('(')).toBe(true)
      expect(wire.endsWith(')')).toBe(true)
    }
  })
})

describe('encryptedMatchTermCodec encode guard', () => {
  it('rejects non-string plaintexts with JS_TYPE_MISMATCH', async () => {
    const { client } = createMockEncryptionClient()
    const ctx = createTestCodecContext({ client })
    const codec = createEncryptedMatchTermCodec(ctx)

    let err: unknown
    try {
      await codec.encode(42 as unknown as string)
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(CipherStashCodecError)
    if (err instanceof CipherStashCodecError) {
      expect(err.code).toBe('JS_TYPE_MISMATCH')
      expect(err.expectedDataType).toBe('string')
      expect(err.actualType).toBe('number')
    }
  })

  it('accepts string plaintexts', async () => {
    const { client } = createMockEncryptionClient()
    const ctx = createTestCodecContext({ client })
    const codec = createEncryptedMatchTermCodec(ctx)
    const wire = await codec.encode('x')
    expect(wire.startsWith('(')).toBe(true)
  })
})

describe('encryptedOreTermCodec encode guard', () => {
  it('rejects string plaintexts with JS_TYPE_MISMATCH', async () => {
    const { client } = createMockEncryptionClient()
    const ctx = createTestCodecContext({ client })
    const codec = createEncryptedOreTermCodec(ctx)

    let err: unknown
    try {
      await codec.encode('not-a-number' as unknown as number)
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(CipherStashCodecError)
    if (err instanceof CipherStashCodecError) {
      expect(err.code).toBe('JS_TYPE_MISMATCH')
      expect(err.expectedDataType).toBe('number')
      expect(err.actualType).toBe('string')
    }
  })

  it('rejects boolean plaintexts with JS_TYPE_MISMATCH', async () => {
    const { client } = createMockEncryptionClient()
    const ctx = createTestCodecContext({ client })
    const codec = createEncryptedOreTermCodec(ctx)

    let err: unknown
    try {
      await codec.encode(true as unknown as number)
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(CipherStashCodecError)
    if (err instanceof CipherStashCodecError) {
      expect(err.code).toBe('JS_TYPE_MISMATCH')
      expect(err.actualType).toBe('boolean')
    }
  })

  it('accepts numbers and Dates', async () => {
    const { client } = createMockEncryptionClient()
    const ctx = createTestCodecContext({ client })
    const codec = createEncryptedOreTermCodec(ctx)

    const w1 = await codec.encode(42)
    const w2 = await codec.encode(new Date('2026-01-01'))
    expect(w1.startsWith('(')).toBe(true)
    expect(w2.startsWith('(')).toBe(true)
  })
})

describe('encryptedSteVecSelectorCodec encode guard', () => {
  it('rejects non-string plaintexts with JS_TYPE_MISMATCH', async () => {
    const { client } = createMockEncryptionClient()
    const ctx = createTestCodecContext({ client })
    const codec = createEncryptedSteVecSelectorCodec(ctx)

    let err: unknown
    try {
      await codec.encode({ a: 1 } as unknown as string)
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(CipherStashCodecError)
    if (err instanceof CipherStashCodecError) {
      expect(err.code).toBe('JS_TYPE_MISMATCH')
      expect(err.expectedDataType).toBe('string')
    }
  })
})

describe('encryptedEqTermCodec encode guard', () => {
  it('rejects bigint plaintexts with UNSUPPORTED_PLAINTEXT_TYPE', async () => {
    const { client } = createMockEncryptionClient()
    const ctx = createTestCodecContext({ client })
    const codec = createEncryptedEqTermCodec(ctx)

    let err: unknown
    try {
      await codec.encode(1n as unknown as string)
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(CipherStashCodecError)
  })
})
