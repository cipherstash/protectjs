import { ENCRYPTED_STORAGE_CODEC_ID } from '@/prisma/core/constants'
import cipherstashEncryptionControl from '@/prisma/exports/control'
import { describe, expect, it } from 'vitest'

/**
 * Phase 3 wires `databaseDependencies.init` and the storage codec's
 * `planTypeOperations` hook into the SQL control extension descriptor.
 * These tests pin the descriptor's shape so a future refactor that
 * accidentally drops one of the wires fails loudly.
 */

describe('cipherstashEncryptionControl', () => {
  it('exposes the EQL install bundle on databaseDependencies.init', () => {
    expect(
      cipherstashEncryptionControl.databaseDependencies?.init,
    ).toBeDefined()
    const init = cipherstashEncryptionControl.databaseDependencies?.init ?? []
    expect(init).toHaveLength(1)
    expect(init[0]?.id).toBe('cipherstash.eql')
  })

  it('registers the storage codec planTypeOperations hook under the storage codec ID', () => {
    const hooks =
      cipherstashEncryptionControl.types?.codecTypes?.controlPlaneHooks
    expect(hooks).toBeDefined()
    const storageHooks = hooks?.[ENCRYPTED_STORAGE_CODEC_ID]
    expect(storageHooks?.planTypeOperations).toBeDefined()
  })

  it('uses a clean semver-compatible pack version with the EQL bundle pinned separately', () => {
    // The descriptor version is the pack-meta version verbatim
    // (semver-clean). The EQL bundle version is surfaced in the
    // install operation's meta payload, not appended to the
    // descriptor version. This separation matches F-31 from the
    // DX audit.
    expect(cipherstashEncryptionControl.version).toMatch(/^\d+\.\d+\.\d+$/)
    const op =
      cipherstashEncryptionControl.databaseDependencies?.init?.[0]?.install?.[0]
    expect(op?.meta?.eqlBundleVersion).toBe('eql-2.2.1')
  })

  it('still surfaces the per-target storage entry from packMeta', () => {
    expect(cipherstashEncryptionControl.types?.storage).toEqual([
      {
        typeId: ENCRYPTED_STORAGE_CODEC_ID,
        familyId: 'sql',
        targetId: 'postgres',
        nativeType: '"public"."eql_v2_encrypted"',
      },
    ])
  })

  it('still wires queryOperations through to the operator descriptors', () => {
    const ops = cipherstashEncryptionControl.queryOperations?.()
    expect(ops?.length).toBeGreaterThan(0)
    expect(ops?.find((op) => op.method === 'eq')).toBeDefined()
  })
})
