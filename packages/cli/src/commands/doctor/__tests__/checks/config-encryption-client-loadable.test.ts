import { describe, expect, it } from 'vitest'
import { configEncryptionClientLoadable } from '../../checks/config/encryption-client-loadable.js'
import type { CheckContext, EncryptClientLoadResult } from '../../types.js'

function ctxWith(result: EncryptClientLoadResult): CheckContext {
  return {
    cwd: '/tmp/p',
    cliVersion: '0',
    flags: {
      json: false,
      fix: false,
      yes: false,
      verbose: false,
      skipDb: false,
      only: [],
    },
    cache: {
      cwd: '/tmp/p',
      packageJson: () => undefined,
      stashConfig: async () => ({ ok: false, reason: 'not-found' }),
      encryptClient: async () => result,
      token: async () => ({ ok: false }),
      integration: () => undefined,
      hasTypeScript: () => false,
    },
  }
}

describe('config.encryption-client-loadable', () => {
  it('passes when the module loaded with a valid client export', async () => {
    const ctx = ctxWith({
      ok: true,
      resolvedPath: '/tmp/enc.ts',
      config: { databaseUrl: 'x', client: './enc.ts' },
      tableCount: 1,
    })
    const result = await configEncryptionClientLoadable.run(ctx)
    expect(result.status).toBe('pass')
  })

  it('skips when the config is missing', async () => {
    const ctx = ctxWith({ ok: false, reason: 'no-config' })
    expect((await configEncryptionClientLoadable.run(ctx)).status).toBe('skip')
  })

  it('skips when the file is missing (covered by earlier check)', async () => {
    const ctx = ctxWith({
      ok: false,
      reason: 'file-missing',
      resolvedPath: '/tmp/nope.ts',
    })
    expect((await configEncryptionClientLoadable.run(ctx)).status).toBe('skip')
  })

  it('fails when the import threw', async () => {
    const ctx = ctxWith({
      ok: false,
      reason: 'import-failed',
      resolvedPath: '/tmp/enc.ts',
      cause: new Error('syntax'),
    })
    const result = await configEncryptionClientLoadable.run(ctx)
    expect(result.status).toBe('fail')
    expect(result.cause).toBeInstanceOf(Error)
  })

  it('fails when no EncryptionClient export found', async () => {
    const ctx = ctxWith({
      ok: false,
      reason: 'no-export',
      resolvedPath: '/tmp/enc.ts',
    })
    const result = await configEncryptionClientLoadable.run(ctx)
    expect(result.status).toBe('fail')
    expect(result.fixHint).toContain('getEncryptConfig')
  })
})
