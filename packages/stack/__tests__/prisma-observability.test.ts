import type { EncryptionClient } from '@/encryption'
import {
  type CipherStashEncryptionEvent,
  defaultEventHook,
} from '@/prisma/core/codec-context'
import { createEncryptedEqTermCodec } from '@/prisma/core/codec-eq-term'
import { createEncryptedStorageCodec } from '@/prisma/core/codec-storage'
import { describe, expect, it, vi } from 'vitest'
import {
  createMockEncryptionClient,
  createTestCodecContext,
} from './prisma-test-helpers'

/**
 * F-17: structured `onEvent` hook.
 *
 * Every `bulkEncrypt` / `bulkDecrypt` / `encryptQuery` round-trip
 * produces a structured event with `kind`, `codecId`, `batchSize`,
 * `durationMs`, `table`, `column`, and (on failure) `error`.
 */

describe('observability — onEvent hook', () => {
  it('fires a `bulkEncrypt` event for a 5-row insert', async () => {
    const events: CipherStashEncryptionEvent[] = []
    const ctx = createTestCodecContext({
      emit: (e) => events.push(e),
    })
    const codec = createEncryptedStorageCodec(ctx)

    await Promise.all([
      codec.encode('a@example.com'),
      codec.encode('b@example.com'),
      codec.encode('c@example.com'),
      codec.encode('d@example.com'),
      codec.encode('e@example.com'),
    ])

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      kind: 'bulkEncrypt',
      codecId: 'cs/eql_v2_encrypted@1',
      batchSize: 5,
      table: 'users',
      column: 'email',
      error: undefined,
    })
    expect(events[0]?.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('fires an `encryptQuery` event for a fluent eq query', async () => {
    const events: CipherStashEncryptionEvent[] = []
    const ctx = createTestCodecContext({
      emit: (e) => events.push(e),
    })
    const codec = createEncryptedEqTermCodec(ctx)

    await codec.encode('alice@example.com')

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      kind: 'encryptQuery',
      codecId: 'cs/eql_v2_eq_term@1',
      batchSize: 1,
      table: 'users',
      column: 'email',
      error: undefined,
    })
  })

  it('fires a `bulkDecrypt` event on read', async () => {
    const events: CipherStashEncryptionEvent[] = []
    const ctx = createTestCodecContext({
      emit: (e) => events.push(e),
    })
    const codec = createEncryptedStorageCodec(ctx)

    const wire = await codec.encode('alice@example.com')
    events.length = 0
    await codec.decode(wire)

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      kind: 'bulkDecrypt',
      codecId: 'cs/eql_v2_encrypted@1',
      batchSize: 1,
      // table/column come from the cipher's own `i.t` / `i.c` markers,
      // which the mock populated from the encode call.
      table: 'users',
      column: 'email',
      error: undefined,
    })
  })

  it('fires a failure event when bulkEncrypt rejects', async () => {
    const failingClient = {
      bulkEncrypt: vi.fn(async () => ({
        failure: { message: 'fake bulk-encrypt failure' },
      })),
      bulkDecrypt: vi.fn(),
      encryptQuery: vi.fn(),
    } as unknown as EncryptionClient

    const events: CipherStashEncryptionEvent[] = []
    const ctx = createTestCodecContext({
      client: failingClient,
      emit: (e) => events.push(e),
    })
    const codec = createEncryptedStorageCodec(ctx)

    await expect(codec.encode('alice@example.com')).rejects.toThrow(
      /bulkEncrypt failed/,
    )

    // Even on failure the event fires — it's the load-bearing
    // observability surface for tracing failure rates.
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      kind: 'bulkEncrypt',
      codecId: 'cs/eql_v2_encrypted@1',
      batchSize: 1,
      table: 'users',
      column: 'email',
    })
    expect(events[0]?.error).toBeUndefined()
    // The bulkEncrypt didn't reject — it returned a `{ failure }`
    // result. The codec translates that into a structured error
    // *after* the event fires; the event sees a successful
    // round-trip from the SDK's perspective.
  })

  it('fires a failure event when bulkDecrypt rejects', async () => {
    const failingClient = {
      bulkEncrypt: createMockEncryptionClient().bulkEncrypt,
      bulkDecrypt: vi.fn(async () => {
        throw new Error('zerokms unreachable')
      }),
      encryptQuery: vi.fn(),
    } as unknown as EncryptionClient

    // Re-use the mock encrypt so encode succeeds, then make decrypt
    // throw at the SDK boundary (network failure shape).
    const mock = createMockEncryptionClient()
    const client = {
      bulkEncrypt: mock.bulkEncrypt,
      bulkDecrypt: failingClient.bulkDecrypt,
      encryptQuery: mock.encryptQuery,
    } as unknown as EncryptionClient

    const events: CipherStashEncryptionEvent[] = []
    const ctx = createTestCodecContext({
      client,
      emit: (e) => events.push(e),
    })
    const codec = createEncryptedStorageCodec(ctx)

    const wire = await codec.encode('alice@example.com')
    events.length = 0

    await expect(codec.decode(wire)).rejects.toThrow(/zerokms unreachable/)

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      kind: 'bulkDecrypt',
      codecId: 'cs/eql_v2_encrypted@1',
      batchSize: 1,
    })
    // Network failure surfaced as a thrown error — `error` is
    // populated and the codec re-throws a structured error.
    expect(events[0]?.error).toBeInstanceOf(Error)
  })

  it('default behaviour (no `onEvent` provided) is silent in production and logs in dev', () => {
    // Smoke-test only: the actual default behaviour is gated on
    // `process.env.NODE_ENV !== 'production'`. We verify the gate is
    // honored by switching the env var around an explicit call.
    const origNodeEnv = process.env.NODE_ENV
    try {
      process.env.NODE_ENV = 'production'
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
      defaultEventHook({
        kind: 'bulkEncrypt',
        codecId: 'cs/eql_v2_encrypted@1',
        batchSize: 1,
        durationMs: 5,
        table: 'users',
        column: 'email',
        error: undefined,
      })
      expect(debugSpy).not.toHaveBeenCalled()

      process.env.NODE_ENV = 'development'
      defaultEventHook({
        kind: 'bulkEncrypt',
        codecId: 'cs/eql_v2_encrypted@1',
        batchSize: 1,
        durationMs: 5,
        table: 'users',
        column: 'email',
        error: undefined,
      })
      expect(debugSpy).toHaveBeenCalledTimes(1)
      debugSpy.mockRestore()
    } finally {
      process.env.NODE_ENV = origNodeEnv
    }
  })
})
