import { describe, expect, it } from 'vitest'
import { databaseEqlInstalled } from '../../checks/database/eql-installed.js'
import type { CheckContext } from '../../types.js'

function ctxFor(databaseUrl: string | undefined, skipDb = false): CheckContext {
  return {
    cwd: '/tmp/p',
    cliVersion: '0',
    flags: {
      json: false,
      fix: false,
      yes: false,
      verbose: false,
      skipDb,
      only: [],
    },
    cache: {
      cwd: '/tmp/p',
      packageJson: () => undefined,
      stashConfig: async () =>
        databaseUrl
          ? {
              ok: true,
              config: { databaseUrl, client: './enc.ts' },
              configPath: '/tmp/stash.config.ts',
            }
          : { ok: false, reason: 'not-found' },
      encryptClient: async () => ({ ok: false, reason: 'no-config' }),
      token: async () => ({ ok: false }),
      integration: () => undefined,
      hasTypeScript: () => false,
    },
  }
}

describe('database.eql-installed', () => {
  it('skips when --skip-db is set', async () => {
    expect(
      (await databaseEqlInstalled.run(ctxFor(undefined, true))).status,
    ).toBe('skip')
  })

  it.skipIf(!process.env.DATABASE_URL)(
    'returns pass or fail (never throws) against a real database',
    async () => {
      const result = await databaseEqlInstalled.run(
        ctxFor(process.env.DATABASE_URL),
      )
      expect(['pass', 'fail']).toContain(result.status)
    },
  )
})
