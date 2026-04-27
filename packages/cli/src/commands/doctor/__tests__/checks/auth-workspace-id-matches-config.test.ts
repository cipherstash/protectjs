import type { CredentialsResult } from '@/lib/auth-state.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { authWorkspaceIdMatchesConfig } from '../../checks/auth/workspace-id-matches-config.js'
import type { CheckContext, TokenInfo } from '../../types.js'

function ctxWith(token: TokenInfo | undefined): CheckContext {
  const tokenResult: CredentialsResult & { token?: TokenInfo } = token
    ? { ok: true, token }
    : { ok: false }
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
      token: async () => tokenResult,
      integration: () => undefined,
      hasTypeScript: () => false,
    },
  }
}

const TOKEN: TokenInfo = {
  workspaceId: 'ABC123',
  subject: 'CS|user',
  issuer: 'https://cts.example',
  services: {},
}

describe('auth.workspace-id-matches-config', () => {
  let original: string | undefined

  beforeEach(() => {
    original = process.env.CS_WORKSPACE_CRN
  })
  afterEach(() => {
    if (original === undefined) delete process.env.CS_WORKSPACE_CRN
    else process.env.CS_WORKSPACE_CRN = original
  })

  it('passes (skipped message) when CS_WORKSPACE_CRN is not set', async () => {
    delete process.env.CS_WORKSPACE_CRN
    const result = await authWorkspaceIdMatchesConfig.run(ctxWith(TOKEN))
    expect(result.status).toBe('pass')
    expect(result.message).toContain('CS_WORKSPACE_CRN not set')
  })

  it('passes when the token workspace matches the CRN', async () => {
    process.env.CS_WORKSPACE_CRN = 'crn:aws-eu-central-1:ABC123'
    expect(
      (await authWorkspaceIdMatchesConfig.run(ctxWith(TOKEN))).status,
    ).toBe('pass')
  })

  it('fails when workspaces differ', async () => {
    process.env.CS_WORKSPACE_CRN = 'crn:aws-eu-central-1:OTHER'
    const result = await authWorkspaceIdMatchesConfig.run(ctxWith(TOKEN))
    expect(result.status).toBe('fail')
    expect(result.message).toContain('ABC123')
    expect(result.message).toContain('OTHER')
  })

  it('fails when CRN is malformed', async () => {
    process.env.CS_WORKSPACE_CRN = 'not-a-crn'
    const result = await authWorkspaceIdMatchesConfig.run(ctxWith(TOKEN))
    expect(result.status).toBe('fail')
    expect(result.message).toContain('valid CRN')
  })
})
