import type { CredentialsResult } from '@/lib/auth-state.js'
import { describe, expect, it } from 'vitest'
import { authAuthenticated } from '../../checks/auth/authenticated.js'
import type { CheckContext, TokenInfo } from '../../types.js'

function ctxWith(
  result: CredentialsResult & { token?: TokenInfo },
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
      packageJson: () => undefined,
      stashConfig: async () => ({ ok: false, reason: 'not-found' }),
      encryptClient: async () => ({ ok: false, reason: 'no-config' }),
      token: async () => result,
      integration: () => undefined,
      hasTypeScript: () => false,
    },
  }
}

describe('auth.authenticated', () => {
  it('passes with the token workspace surfaced in message', async () => {
    const ctx = ctxWith({
      ok: true,
      token: {
        workspaceId: 'WS123',
        subject: 'CS|user',
        issuer: 'https://cts.example',
        services: {},
      },
    })
    const result = await authAuthenticated.run(ctx)
    expect(result.status).toBe('pass')
    expect(result.message).toContain('WS123')
  })

  it('fails with login hint when not authenticated', async () => {
    const ctx = ctxWith({ ok: false, code: 'NOT_AUTHENTICATED' })
    const result = await authAuthenticated.run(ctx)
    expect(result.status).toBe('fail')
    expect(result.fixHint).toContain('stash auth login')
    expect(result.message).toBe('Not authenticated')
  })

  it('surfaces unknown auth codes in the failure message', async () => {
    const ctx = ctxWith({
      ok: false,
      code: 'REQUEST_ERROR',
      cause: new Error('timeout'),
    })
    const result = await authAuthenticated.run(ctx)
    expect(result.status).toBe('fail')
    expect(result.message).toContain('REQUEST_ERROR')
  })
})
