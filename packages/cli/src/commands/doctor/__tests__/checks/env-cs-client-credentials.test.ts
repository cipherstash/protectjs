import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { envCsClientCredentials } from '../../checks/env/cs-client-credentials.js'
import type { CheckContext } from '../../types.js'

const ctx: CheckContext = {
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
    token: async () => ({ ok: false }),
    integration: () => undefined,
    hasTypeScript: () => false,
  },
}

const VARS = ['CS_CLIENT_ID', 'CS_CLIENT_KEY', 'CS_CLIENT_ACCESS_KEY'] as const

describe('env.cs-client-credentials', () => {
  const originals: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const v of VARS) {
      originals[v] = process.env[v]
      delete process.env[v]
    }
  })
  afterEach(() => {
    for (const v of VARS) {
      if (originals[v] === undefined) delete process.env[v]
      else process.env[v] = originals[v]
    }
  })

  it('fails (info severity) when all three vars are unset', async () => {
    const result = await envCsClientCredentials.run(ctx)
    expect(result.status).toBe('fail')
    const details = result.details as { missing: string[] } | undefined
    expect(details?.missing).toEqual([...VARS])
  })

  it('lists only the missing vars', async () => {
    process.env.CS_CLIENT_ID = 'id'
    process.env.CS_CLIENT_KEY = 'key'
    const result = await envCsClientCredentials.run(ctx)
    expect(result.status).toBe('fail')
    expect((result.details as { missing: string[] }).missing).toEqual([
      'CS_CLIENT_ACCESS_KEY',
    ])
  })

  it('passes when all three vars are set', async () => {
    process.env.CS_CLIENT_ID = 'id'
    process.env.CS_CLIENT_KEY = 'key'
    process.env.CS_CLIENT_ACCESS_KEY = 'access'
    expect((await envCsClientCredentials.run(ctx)).status).toBe('pass')
  })
})
