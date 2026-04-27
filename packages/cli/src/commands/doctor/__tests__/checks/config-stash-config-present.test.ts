import type {
  ResolvedStashConfig,
  TryLoadStashConfigResult,
} from '@/config/index.js'
import { describe, expect, it } from 'vitest'
import { configStashConfigPresent } from '../../checks/config/stash-config-present.js'
import type { CheckContext } from '../../types.js'

function ctxWith(result: TryLoadStashConfigResult): CheckContext {
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
      stashConfig: async () => result,
      encryptClient: async () => ({ ok: false, reason: 'no-config' }),
      token: async () => ({ ok: false }),
      integration: () => undefined,
      hasTypeScript: () => false,
    },
  }
}

const RESOLVED: ResolvedStashConfig = {
  databaseUrl: 'postgres://localhost/db',
  client: './src/encryption/index.ts',
}

describe('config.stash-config-present', () => {
  it('passes when a config was found and parsed', async () => {
    const ctx = ctxWith({
      ok: true,
      config: RESOLVED,
      configPath: '/tmp/stash.config.ts',
    })
    const result = await configStashConfigPresent.run(ctx)
    expect(result.status).toBe('pass')
    expect(result.message).toContain('/tmp/stash.config.ts')
  })

  it('fails when the file was not found', async () => {
    const ctx = ctxWith({ ok: false, reason: 'not-found' })
    const result = await configStashConfigPresent.run(ctx)
    expect(result.status).toBe('fail')
    expect(result.fixHint).toContain('stash init')
  })

  it('passes (defers to validity check) when the file exists but is invalid', async () => {
    const ctx = ctxWith({
      ok: false,
      reason: 'invalid',
      configPath: '/tmp/stash.config.ts',
      issues: [{ path: ['databaseUrl'], message: 'required' }],
    })
    const result = await configStashConfigPresent.run(ctx)
    expect(result.status).toBe('pass')
  })
})
