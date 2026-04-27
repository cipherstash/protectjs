import type {
  CodecRegistry,
  CodecTrait,
  SqlCodec,
} from '../internal-types/prisma-next'
import type { CipherStashCodecContext } from './codec-context'
import { createEncryptedEqTermCodec } from './codec-eq-term'
import { createEncryptedMatchTermCodec } from './codec-match-term'
import { createEncryptedOreTermCodec } from './codec-ore-term'
import { createEncryptedSteVecSelectorCodec } from './codec-ste-vec-term'
import { createEncryptedStorageCodec } from './codec-storage'

/**
 * Build a per-extension codec registry. Each codec instance closes
 * over the supplied context (client binding + observability hook),
 * so two `cipherstashEncryption({...})` calls produce two independent
 * codec graphs with no shared mutable state.
 *
 * Once Prisma Next ships, the structural compatibility with
 * `createCodecRegistry()` from `@prisma-next/sql-relational-core/ast`
 * is preserved — this helper can be replaced with two
 * `register(...)` calls against the upstream registry.
 */
export function createEncryptionCodecRegistry(
  ctx: CipherStashCodecContext,
): CodecRegistry {
  const byId = new Map<string, SqlCodec>()
  const byScalar = new Map<string, SqlCodec[]>()

  const register = (codec: SqlCodec): void => {
    if (byId.has(codec.id)) {
      throw new Error(`Codec with ID '${codec.id}' is already registered`)
    }
    byId.set(codec.id, codec)
    for (const scalar of codec.targetTypes) {
      const existing = byScalar.get(scalar)
      if (existing) existing.push(codec)
      else byScalar.set(scalar, [codec])
    }
  }

  register(createEncryptedStorageCodec(ctx))
  register(createEncryptedEqTermCodec(ctx))
  register(createEncryptedMatchTermCodec(ctx))
  register(createEncryptedOreTermCodec(ctx))
  register(createEncryptedSteVecSelectorCodec(ctx))

  const traitsOf = (codecId: string): readonly CodecTrait[] => {
    return (
      (byId.get(codecId)?.traits as readonly CodecTrait[] | undefined) ?? []
    )
  }

  return {
    get: (id: string) => byId.get(id),
    has: (id: string) => byId.has(id),
    register,
    hasTrait: (id, trait) => traitsOf(id).includes(trait),
    traitsOf,
    values: () => byId.values(),
    [Symbol.iterator]: () => byId.values(),
  }
}
