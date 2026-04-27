import { describe, expect, it } from 'vitest'
import { databaseConnects } from '../../checks/database/connects.js'
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

describe('database.connects', () => {
  it('skips when --skip-db is set', async () => {
    const result = await databaseConnects.run(ctxFor(undefined, true))
    expect(result.status).toBe('skip')
  })

  it.skipIf(!process.env.DATABASE_URL)(
    'passes against a real database when DATABASE_URL is set',
    async () => {
      const result = await databaseConnects.run(
        ctxFor(process.env.DATABASE_URL),
      )
      expect(result.status).toBe('pass')
    },
  )

  it('fails against an unreachable database', async () => {
    const result = await databaseConnects.run(
      ctxFor('postgres://nope:1/postgres'),
    )
    expect(result.status).toBe('fail')
  })
})
