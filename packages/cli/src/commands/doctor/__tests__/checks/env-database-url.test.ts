import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { envDatabaseUrl } from '../../checks/env/database-url.js'
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

describe('env.database-url', () => {
  let original: string | undefined

  beforeEach(() => {
    original = process.env.DATABASE_URL
  })
  afterEach(() => {
    if (original === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = original
  })

  it('passes when DATABASE_URL is set', async () => {
    process.env.DATABASE_URL = 'postgres://localhost:5432/test'
    expect((await envDatabaseUrl.run(ctx)).status).toBe('pass')
  })

  it('fails when DATABASE_URL is missing', async () => {
    delete process.env.DATABASE_URL
    const result = await envDatabaseUrl.run(ctx)
    expect(result.status).toBe('fail')
    expect(result.fixHint).toContain('DATABASE_URL')
  })
})
