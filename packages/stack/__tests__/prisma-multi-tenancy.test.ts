import { createEncryptedStorageCodec } from '@/prisma/core/codec-storage'
import { describe, expect, it } from 'vitest'
import {
  createMockEncryptionClient,
  createTestCodecContext,
} from './prisma-test-helpers'

/**
 * F-4: per-extension `EncryptionClient` binding.
 *
 * Each `cipherstashEncryption({...})` call produces a fresh codec
 * graph with its own client closed over. Two extensions must not
 * cross-talk: a call routed through extension A's codec never lands
 * on extension B's client.
 */

describe('per-extension client isolation', () => {
  it('routes calls through the bound client only — two extensions never cross-talk', async () => {
    const tenantA = createMockEncryptionClient()
    const tenantB = createMockEncryptionClient()

    const ctxA = createTestCodecContext({ client: tenantA.client })
    const ctxB = createTestCodecContext({ client: tenantB.client })

    const codecA = createEncryptedStorageCodec(ctxA)
    const codecB = createEncryptedStorageCodec(ctxB)

    await codecA.encode('alice@example.com')
    await codecB.encode('bob@example.com')
    await codecA.encode('alice2@example.com')

    // Each tenant's client received exactly the calls routed through
    // its own codec — no cross-talk.
    expect(tenantA.bulkEncrypt).toHaveBeenCalledTimes(2)
    expect(tenantB.bulkEncrypt).toHaveBeenCalledTimes(1)

    const aPayloads = tenantA.bulkEncrypt.mock.calls.flatMap((call) => {
      const [payload] = call
      if (!Array.isArray(payload)) return []
      return payload.map((p) => p.plaintext)
    })
    const bPayloads = tenantB.bulkEncrypt.mock.calls.flatMap((call) => {
      const [payload] = call
      if (!Array.isArray(payload)) return []
      return payload.map((p) => p.plaintext)
    })
    expect(aPayloads).toEqual(['alice@example.com', 'alice2@example.com'])
    expect(bPayloads).toEqual(['bob@example.com'])
  })

  it('produces independent batchers per extension — concurrent calls in two extensions do not share a batch', async () => {
    const tenantA = createMockEncryptionClient()
    const tenantB = createMockEncryptionClient()

    const ctxA = createTestCodecContext({ client: tenantA.client })
    const ctxB = createTestCodecContext({ client: tenantB.client })

    const codecA = createEncryptedStorageCodec(ctxA)
    const codecB = createEncryptedStorageCodec(ctxB)

    await Promise.all([
      codecA.encode('a1'),
      codecB.encode('b1'),
      codecA.encode('a2'),
      codecB.encode('b2'),
    ])

    // Each tenant got exactly one bulkEncrypt call (the codec's
    // microtask batcher coalesces *within* the extension), and the
    // payloads contain only that tenant's plaintexts.
    expect(tenantA.bulkEncrypt).toHaveBeenCalledTimes(1)
    expect(tenantB.bulkEncrypt).toHaveBeenCalledTimes(1)

    const aPayload = tenantA.bulkEncrypt.mock.calls[0]?.[0]
    const bPayload = tenantB.bulkEncrypt.mock.calls[0]?.[0]
    if (!Array.isArray(aPayload) || !Array.isArray(bPayload)) {
      throw new Error('expected array payloads')
    }
    expect(aPayload.map((p) => p.plaintext)).toEqual(['a1', 'a2'])
    expect(bPayload.map((p) => p.plaintext)).toEqual(['b1', 'b2'])
  })
})
