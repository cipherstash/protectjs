import { CipherStashCodecError } from '@/prisma/core/errors'
import { cipherstashEncryption } from '@/prisma/exports/runtime'
import type { ContractLike } from '@/prisma/exports/runtime'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ALL_DATATYPES_CONTRACT,
  createMockEncryptionClient,
} from './prisma-test-helpers'

const ENV_VAR_NAMES = [
  'CS_WORKSPACE_CRN',
  'CS_CLIENT_ID',
  'CS_CLIENT_KEY',
] as const

describe('cipherstashEncryption — eager env-var validation (F-5)', () => {
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const name of ENV_VAR_NAMES) {
      saved[name] = process.env[name]
      delete process.env[name]
    }
  })

  afterEach(() => {
    for (const name of ENV_VAR_NAMES) {
      const value = saved[name]
      if (value === undefined) {
        delete process.env[name]
      } else {
        process.env[name] = value
      }
    }
  })

  it('throws synchronously at construction time when no encryptionClient and required env vars are missing', () => {
    let err: unknown
    try {
      cipherstashEncryption({ contract: ALL_DATATYPES_CONTRACT })
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(CipherStashCodecError)
    if (err instanceof CipherStashCodecError) {
      expect(err.code).toBe('CONFIG_MISSING_ENV')
      // Every missing env var named on a single line.
      for (const name of ENV_VAR_NAMES) {
        expect(err.message).toContain(name)
      }
      // Single line: should not have any newlines that would split
      // the missing-env list across multiple log entries.
      const firstLine = err.message.split('\n')[0] ?? ''
      for (const name of ENV_VAR_NAMES) {
        expect(firstLine).toContain(name)
      }
    }
  })

  it('does not throw at construction time when an encryptionClient is supplied', () => {
    const { client } = createMockEncryptionClient()
    expect(() =>
      cipherstashEncryption({
        encryptionClient: client,
        contract: ALL_DATATYPES_CONTRACT,
      }),
    ).not.toThrow()
  })

  it('does not throw at construction time when only some env vars are present', () => {
    process.env.CS_WORKSPACE_CRN = 'crn:test.aws:test'
    let err: unknown
    try {
      cipherstashEncryption({ contract: ALL_DATATYPES_CONTRACT })
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(CipherStashCodecError)
    if (err instanceof CipherStashCodecError) {
      expect(err.code).toBe('CONFIG_MISSING_ENV')
      // Only the missing ones are named.
      expect(err.message).not.toContain('CS_WORKSPACE_CRN,')
      expect(err.message).toContain('CS_CLIENT_ID')
      expect(err.message).toContain('CS_CLIENT_KEY')
    }
  })

  it('does not throw when all env vars are set', () => {
    for (const name of ENV_VAR_NAMES) {
      process.env[name] = `placeholder-${name}`
    }
    expect(() =>
      cipherstashEncryption({ contract: ALL_DATATYPES_CONTRACT }),
    ).not.toThrow()
  })
})

describe('cipherstashEncryption — descriptor shape', () => {
  const { client } = createMockEncryptionClient()

  it('returns a fresh descriptor on every call (no module-level singleton)', () => {
    const a = cipherstashEncryption({
      encryptionClient: client,
      contract: ALL_DATATYPES_CONTRACT,
    })
    const b = cipherstashEncryption({
      encryptionClient: client,
      contract: ALL_DATATYPES_CONTRACT,
    })
    expect(a).not.toBe(b)
  })

  it('exposes the codec registry via codecs()', () => {
    const ext = cipherstashEncryption({
      encryptionClient: client,
      contract: ALL_DATATYPES_CONTRACT,
    })
    const registry = ext.codecs()
    expect(registry.get('cs/eql_v2_encrypted@1')).toBeDefined()
    expect(registry.get('cs/eql_v2_eq_term@1')).toBeDefined()
    expect(registry.get('cs/eql_v2_match_term@1')).toBeDefined()
    expect(registry.get('cs/eql_v2_ore_term@1')).toBeDefined()
    expect(registry.get('cs/eql_v2_ste_vec_selector@1')).toBeDefined()
  })

  it('exposes the operator descriptors via queryOperations()', () => {
    const ext = cipherstashEncryption({
      encryptionClient: client,
      contract: ALL_DATATYPES_CONTRACT,
    })
    const ops = ext.queryOperations?.() ?? []
    expect(ops.find((o) => o.method === 'eq')).toBeDefined()
    expect(ops.find((o) => o.method === 'gte')).toBeDefined()
    expect(ops.find((o) => o.method === 'ilike')).toBeDefined()
    expect(ops.find((o) => o.method === 'jsonbPathExists')).toBeDefined()
  })
})

describe('cipherstashEncryption — empty contract', () => {
  const empty: ContractLike = { storage: { tables: {} } }
  const { client } = createMockEncryptionClient()

  it('constructs successfully when an encryptionClient is supplied', () => {
    expect(() =>
      cipherstashEncryption({ encryptionClient: client, contract: empty }),
    ).not.toThrow()
  })
})
