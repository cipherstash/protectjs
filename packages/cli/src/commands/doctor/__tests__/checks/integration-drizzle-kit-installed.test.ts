import { describe, expect, it } from 'vitest'
import type { Integration } from '../../../wizard/lib/types.js'
import { integrationDrizzleKitInstalled } from '../../checks/integration/drizzle-kit-installed.js'
import type { CheckContext, PackageJson } from '../../types.js'

function ctxWith(
  pkg: PackageJson | undefined,
  integration: Integration | undefined,
): CheckContext {
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
      packageJson: () => pkg,
      stashConfig: async () => ({ ok: false, reason: 'not-found' }),
      encryptClient: async () => ({ ok: false, reason: 'no-config' }),
      token: async () => ({ ok: false }),
      integration: () => integration,
      hasTypeScript: () => false,
    },
  }
}

describe('integration.drizzle.kit-installed', () => {
  it('skips when integration is not drizzle', async () => {
    const ctx = ctxWith({ dependencies: {} }, 'supabase')
    expect((await integrationDrizzleKitInstalled.run(ctx)).status).toBe('skip')
  })

  it('passes when drizzle-kit is a devDep', async () => {
    const ctx = ctxWith(
      { devDependencies: { 'drizzle-kit': '^0.22.0' } },
      'drizzle',
    )
    expect((await integrationDrizzleKitInstalled.run(ctx)).status).toBe('pass')
  })

  it('fails when drizzle-kit is missing', async () => {
    const ctx = ctxWith(
      { dependencies: { 'drizzle-orm': '^0.30.0' } },
      'drizzle',
    )
    const result = await integrationDrizzleKitInstalled.run(ctx)
    expect(result.status).toBe('fail')
    expect(result.fixHint).toContain('drizzle-kit')
  })
})
