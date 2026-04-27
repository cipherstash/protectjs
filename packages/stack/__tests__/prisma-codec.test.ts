import { createEncryptedEqTermCodec } from '@/prisma/core/codec-eq-term'
import { createEncryptedMatchTermCodec } from '@/prisma/core/codec-match-term'
import { createEncryptedOreTermCodec } from '@/prisma/core/codec-ore-term'
import { createEncryptedSteVecSelectorCodec } from '@/prisma/core/codec-ste-vec-term'
import { createEncryptedStorageCodec } from '@/prisma/core/codec-storage'
import {
  eqlFromCompositeLiteral,
  eqlToCompositeLiteral,
} from '@/prisma/core/wire'
import type { Encrypted } from '@/types'
import { describe, expect, it } from 'vitest'
import {
  ALL_DATATYPES_CONTRACT,
  createMockEncryptionClient,
  createTestCodecContext,
} from './prisma-test-helpers'

describe('eqlToCompositeLiteral / eqlFromCompositeLiteral', () => {
  it('round-trips an Encrypted JSON envelope through the composite literal form', () => {
    const original: Encrypted = {
      i: { t: 't', c: 'c' },
      v: 1,
      c: 'cipher-with-"quotes"',
    }
    const literal = eqlToCompositeLiteral(original)
    expect(literal.startsWith('(')).toBe(true)
    expect(literal.endsWith(')')).toBe(true)
    const parsed = eqlFromCompositeLiteral(literal)
    expect(parsed).toEqual(original)
  })
})

describe('encryptedStorageCodec', () => {
  it('encodes a single string value through bulkEncrypt and wraps it in a composite literal', async () => {
    const { client, bulkEncrypt } = createMockEncryptionClient()
    const ctx = createTestCodecContext({ client })
    const codec = createEncryptedStorageCodec(ctx)

    const wire = await codec.encode('alice@example.com')

    expect(bulkEncrypt).toHaveBeenCalledTimes(1)
    expect(wire.startsWith('(')).toBe(true)
    expect(wire.endsWith(')')).toBe(true)
    const parsed = eqlFromCompositeLiteral(wire)
    expect(parsed.c).toBe('enc:alice@example.com')
    // The contract's first string column (`email` on `users`) was used.
    expect(parsed.i.t).toBe('users')
    expect(parsed.i.c).toBe('email')
  })

  it('coalesces N concurrent encode calls into a SINGLE bulkEncrypt invocation', async () => {
    const { client, bulkEncrypt } = createMockEncryptionClient()
    const ctx = createTestCodecContext({ client })
    const codec = createEncryptedStorageCodec(ctx)

    const inputs = [
      'alice@example.com',
      'bob@example.com',
      'carol@example.com',
      'dave@example.com',
    ]
    const promises = inputs.map((v) => codec.encode(v))
    const wires = await Promise.all(promises)

    expect(bulkEncrypt).toHaveBeenCalledTimes(1)
    const call = bulkEncrypt.mock.calls[0]?.[0]
    expect(call).toBeDefined()
    if (!Array.isArray(call)) throw new Error('expected array payload')
    expect(call.map((p) => p.plaintext)).toEqual(inputs)

    const decoded = wires.map((w: string) => eqlFromCompositeLiteral(w).c)
    expect(decoded).toEqual(inputs.map((v) => `enc:${v}`))
  })

  it('round-trips encode -> decode back to the original string plaintext', async () => {
    const { client } = createMockEncryptionClient()
    const ctx = createTestCodecContext({ client })
    const codec = createEncryptedStorageCodec(ctx)

    const original = 'alice@example.com'
    const wire = await codec.encode(original)
    const decoded = await codec.decode(wire)

    expect(decoded).toBe(original)
  })

  it("routes a number plaintext through the contract's number column", async () => {
    const { client, bulkEncrypt } = createMockEncryptionClient()
    const ctx = createTestCodecContext({ client })
    const codec = createEncryptedStorageCodec(ctx)

    const wire = await codec.encode(42)
    expect(bulkEncrypt).toHaveBeenCalledTimes(1)
    const opts = bulkEncrypt.mock.calls[0]?.[1] as
      | { column: { getName(): string } }
      | undefined
    expect(opts?.column.getName()).toBe('age')

    const parsed = eqlFromCompositeLiteral(wire)
    expect(parsed.i.c).toBe('age')
    expect(parsed.c).toBe('enc:42')
  })

  it("routes a boolean plaintext through the contract's boolean column", async () => {
    const { client, bulkEncrypt } = createMockEncryptionClient()
    const ctx = createTestCodecContext({ client })
    const codec = createEncryptedStorageCodec(ctx)

    await codec.encode(true)
    const opts = bulkEncrypt.mock.calls[0]?.[1] as
      | { column: { getName(): string } }
      | undefined
    expect(opts?.column.getName()).toBe('isActive')
  })

  it("routes a Date plaintext through the contract's date column with ISO serialization", async () => {
    const { client, bulkEncrypt } = createMockEncryptionClient()
    const ctx = createTestCodecContext({ client })
    const codec = createEncryptedStorageCodec(ctx)

    const original = new Date('2026-04-27T12:00:00.000Z')
    const wire = await codec.encode(original)

    const opts = bulkEncrypt.mock.calls[0]?.[1] as
      | { column: { getName(): string } }
      | undefined
    expect(opts?.column.getName()).toBe('createdAt')
    const payload = bulkEncrypt.mock.calls[0]?.[0]
    if (!Array.isArray(payload)) throw new Error('expected array payload')
    expect(payload[0].plaintext).toBe(original.toISOString())

    const parsed = eqlFromCompositeLiteral(wire)
    expect(parsed.i.c).toBe('createdAt')
  })

  it('trusts the SDK on decode — Date columns come back as whatever the SDK returns', async () => {
    // The mock's bulkDecrypt strips the `enc:` prefix and returns the
    // ISO string. The codec passes that through verbatim — no payload
    // inspection. Real SDK consumers honour `cast_as` and return a
    // Date; the mock here doesn't, which validates the codec is
    // *not* doing its own rehydration.
    const { client } = createMockEncryptionClient()
    const ctx = createTestCodecContext({ client })
    const codec = createEncryptedStorageCodec(ctx)

    const original = new Date('2026-04-27T12:00:00.000Z')
    const wire = await codec.encode(original)
    const decoded = await codec.decode(wire)

    // Mock returns the raw stripped string; the codec didn't try to
    // rehydrate it — that's the SDK's job.
    expect(decoded).toBe(original.toISOString())
  })

  it("routes a JSON plaintext through the contract's json column", async () => {
    const { client, bulkEncrypt } = createMockEncryptionClient()
    const ctx = createTestCodecContext({ client })
    const codec = createEncryptedStorageCodec(ctx)

    const obj = { name: 'Alice', tags: ['a', 'b'] }
    await codec.encode(obj)
    const opts = bulkEncrypt.mock.calls[0]?.[1] as
      | { column: { getName(): string } }
      | undefined
    expect(opts?.column.getName()).toBe('profile')
  })

  it('coalesces N concurrent decode calls into a SINGLE bulkDecrypt invocation', async () => {
    const { client, bulkDecrypt } = createMockEncryptionClient()
    const ctx = createTestCodecContext({ client })
    const codec = createEncryptedStorageCodec(ctx)

    const wires = await Promise.all(['a', 'b', 'c'].map((v) => codec.encode(v)))

    bulkDecrypt.mockClear()

    const decoded = await Promise.all(wires.map((w: string) => codec.decode(w)))

    expect(bulkDecrypt).toHaveBeenCalledTimes(1)
    expect(decoded).toEqual(['a', 'b', 'c'])
  })

  it('renders the JS-side output type per dataType', () => {
    const { client } = createMockEncryptionClient()
    const ctx = createTestCodecContext({ client })
    const codec = createEncryptedStorageCodec(ctx)

    expect(codec.renderOutputType?.({ dataType: 'string' })).toBe('string')
    expect(codec.renderOutputType?.({ dataType: 'number' })).toBe('number')
    expect(codec.renderOutputType?.({ dataType: 'boolean' })).toBe('boolean')
    expect(codec.renderOutputType?.({ dataType: 'date' })).toBe('Date')
    expect(codec.renderOutputType?.({ dataType: 'json' })).toBe('unknown')
  })

  it('throws NO_COLUMN_FOR_DATATYPE when the contract has no column for the JS type', async () => {
    // Contract with only a string column — encoding a number raises a
    // structured error at the encode site.
    const emailColumn =
      ALL_DATATYPES_CONTRACT.storage?.tables?.users?.columns?.email
    if (!emailColumn) throw new Error('test fixture missing email column')
    const stringOnlyContract: typeof ALL_DATATYPES_CONTRACT = {
      storage: {
        tables: {
          users: {
            columns: {
              email: emailColumn,
            },
          },
        },
      },
    }
    const { client } = createMockEncryptionClient()
    const ctx = createTestCodecContext({
      client,
      contract: stringOnlyContract,
    })
    const codec = createEncryptedStorageCodec(ctx)

    await expect(codec.encode(42)).rejects.toThrow(
      /no encrypted column with dataType 'number'/,
    )
  })
})

describe('encryptedEqTermCodec', () => {
  it("encodes a string query term through encryptQuery with the contract's string column", async () => {
    const { client, encryptQuery } = createMockEncryptionClient()
    const ctx = createTestCodecContext({ client })
    const codec = createEncryptedEqTermCodec(ctx)

    const wire = await codec.encode('alice@example.com')

    expect(encryptQuery).toHaveBeenCalledTimes(1)
    const terms = encryptQuery.mock.calls[0]?.[0]
    if (!Array.isArray(terms)) throw new Error('expected array of terms')
    expect(terms[0].queryType).toBe('equality')
    expect(terms[0].value).toBe('alice@example.com')
    expect(terms[0].column.getName()).toBe('email')

    const parsed = eqlFromCompositeLiteral(wire)
    expect(parsed.c).toBe('qterm:alice@example.com')
  })

  it('coalesces N concurrent encodes into a SINGLE encryptQuery batch', async () => {
    const { client, encryptQuery } = createMockEncryptionClient()
    const ctx = createTestCodecContext({ client })
    const codec = createEncryptedEqTermCodec(ctx)

    const inputs = ['x', 'y', 'z']
    const wires = await Promise.all(inputs.map((v) => codec.encode(v)))

    expect(encryptQuery).toHaveBeenCalledTimes(1)
    expect(wires).toHaveLength(3)
  })

  it('encodes a Date eq-term as ISO string against the date column', async () => {
    const { client, encryptQuery } = createMockEncryptionClient()
    const ctx = createTestCodecContext({ client })
    const codec = createEncryptedEqTermCodec(ctx)

    const date = new Date('2026-01-01T00:00:00.000Z')
    await codec.encode(date)
    const terms = encryptQuery.mock.calls[0]?.[0]
    if (!Array.isArray(terms)) throw new Error('expected array of terms')
    expect(terms[0].value).toBe(date.toISOString())
    expect(terms[0].column.getName()).toBe('createdAt')
  })

  it('refuses to decode (write-only by construction)', async () => {
    const { client } = createMockEncryptionClient()
    const ctx = createTestCodecContext({ client })
    const codec = createEncryptedEqTermCodec(ctx)
    await expect(codec.decode('anything')).rejects.toThrow(/write-only/)
  })
})

describe('encryptedMatchTermCodec', () => {
  it('encodes a free-text term through encryptQuery with queryType=freeTextSearch', async () => {
    const { client, encryptQuery } = createMockEncryptionClient()
    const ctx = createTestCodecContext({ client })
    const codec = createEncryptedMatchTermCodec(ctx)

    const wire = await codec.encode('%example.com')

    expect(encryptQuery).toHaveBeenCalledTimes(1)
    const terms = encryptQuery.mock.calls[0]?.[0]
    if (!Array.isArray(terms)) throw new Error('expected array of terms')
    expect(terms[0].queryType).toBe('freeTextSearch')
    expect(terms[0].value).toBe('%example.com')
    expect(terms[0].column.getName()).toBe('email')

    const parsed = eqlFromCompositeLiteral(wire)
    expect(parsed.c).toBe('qterm:%example.com')
  })

  it('coalesces N concurrent match-term encodes into a SINGLE batch', async () => {
    const { client, encryptQuery } = createMockEncryptionClient()
    const ctx = createTestCodecContext({ client })
    const codec = createEncryptedMatchTermCodec(ctx)

    const inputs = ['alice', 'bob', 'carol']
    const wires = await Promise.all(inputs.map((v) => codec.encode(v)))

    expect(encryptQuery).toHaveBeenCalledTimes(1)
    expect(wires).toHaveLength(3)
  })

  it('refuses to decode', async () => {
    const { client } = createMockEncryptionClient()
    const ctx = createTestCodecContext({ client })
    const codec = createEncryptedMatchTermCodec(ctx)
    await expect(codec.decode('anything')).rejects.toThrow(/write-only/)
  })
})

describe('encryptedOreTermCodec', () => {
  it('encodes a number range term through encryptQuery with queryType=orderAndRange', async () => {
    const { client, encryptQuery } = createMockEncryptionClient()
    const ctx = createTestCodecContext({ client })
    const codec = createEncryptedOreTermCodec(ctx)

    await codec.encode(42)

    expect(encryptQuery).toHaveBeenCalledTimes(1)
    const terms = encryptQuery.mock.calls[0]?.[0]
    if (!Array.isArray(terms)) throw new Error('expected array of terms')
    expect(terms[0].queryType).toBe('orderAndRange')
    expect(terms[0].value).toBe(42)
    expect(terms[0].column.getName()).toBe('age')
  })

  it('encodes a Date range term as ISO string against the date column', async () => {
    const { client, encryptQuery } = createMockEncryptionClient()
    const ctx = createTestCodecContext({ client })
    const codec = createEncryptedOreTermCodec(ctx)

    const date = new Date('2025-05-15T12:30:00.000Z')
    await codec.encode(date)

    const terms = encryptQuery.mock.calls[0]?.[0]
    if (!Array.isArray(terms)) throw new Error('expected array of terms')
    expect(terms[0].value).toBe(date.toISOString())
    expect(terms[0].column.getName()).toBe('createdAt')
  })

  it('refuses non-numeric, non-Date plaintexts', async () => {
    const { client } = createMockEncryptionClient()
    const ctx = createTestCodecContext({ client })
    const codec = createEncryptedOreTermCodec(ctx)

    await expect(codec.encode('not-a-number')).rejects.toThrow(/number or Date/)
    await expect(codec.encode(true)).rejects.toThrow(/number or Date/)
  })

  it('coalesces N concurrent ORE encodes (per dataType) into a SINGLE batch', async () => {
    const { client, encryptQuery } = createMockEncryptionClient()
    const ctx = createTestCodecContext({ client })
    const codec = createEncryptedOreTermCodec(ctx)

    const wires = await Promise.all([
      codec.encode(1),
      codec.encode(2),
      codec.encode(3),
    ])

    expect(encryptQuery).toHaveBeenCalledTimes(1)
    expect(wires).toHaveLength(3)
  })

  it('refuses to decode', async () => {
    const { client } = createMockEncryptionClient()
    const ctx = createTestCodecContext({ client })
    const codec = createEncryptedOreTermCodec(ctx)
    await expect(codec.decode('anything')).rejects.toThrow(/write-only/)
  })
})

describe('encryptedSteVecSelectorCodec', () => {
  it('encodes a JSONPath selector through encryptQuery with queryType=steVecSelector', async () => {
    const { client, encryptQuery } = createMockEncryptionClient()
    const ctx = createTestCodecContext({ client })
    const codec = createEncryptedSteVecSelectorCodec(ctx)

    const selector = '$.user.email'
    const wire = await codec.encode(selector)

    expect(encryptQuery).toHaveBeenCalledTimes(1)
    const terms = encryptQuery.mock.calls[0]?.[0]
    if (!Array.isArray(terms)) throw new Error('expected array of terms')
    expect(terms[0].queryType).toBe('steVecSelector')
    expect(terms[0].value).toBe(selector)
    expect(terms[0].column.getName()).toBe('profile')

    const parsed = eqlFromCompositeLiteral(wire)
    expect(parsed.c).toBe(`qterm:${selector}`)
  })

  it('coalesces N concurrent selector encodes into a SINGLE batch', async () => {
    const { client, encryptQuery } = createMockEncryptionClient()
    const ctx = createTestCodecContext({ client })
    const codec = createEncryptedSteVecSelectorCodec(ctx)

    const wires = await Promise.all([codec.encode('$.a'), codec.encode('$.b')])

    expect(encryptQuery).toHaveBeenCalledTimes(1)
    expect(wires).toHaveLength(2)
  })

  it('refuses to decode', async () => {
    const { client } = createMockEncryptionClient()
    const ctx = createTestCodecContext({ client })
    const codec = createEncryptedSteVecSelectorCodec(ctx)
    await expect(codec.decode('anything')).rejects.toThrow(/write-only/)
  })
})
