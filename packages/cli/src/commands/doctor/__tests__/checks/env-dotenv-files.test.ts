import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { envDotenvFiles } from '../../checks/env/dotenv-files.js'
import type { CheckContext } from '../../types.js'

function ctxFor(cwd: string): CheckContext {
  return {
    cwd,
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
      cwd,
      packageJson: () => undefined,
      stashConfig: async () => ({ ok: false, reason: 'not-found' }),
      encryptClient: async () => ({ ok: false, reason: 'no-config' }),
      token: async () => ({ ok: false }),
      integration: () => undefined,
      hasTypeScript: () => false,
    },
  }
}

describe('env.dotenv-files', () => {
  let tmp: string

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'doctor-env-'))
  })
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  it('fails when no .env files exist', async () => {
    const result = await envDotenvFiles.run(ctxFor(tmp))
    expect(result.status).toBe('fail')
  })

  it('passes when .env.local exists', async () => {
    writeFileSync(join(tmp, '.env.local'), 'FOO=bar\n')
    const result = await envDotenvFiles.run(ctxFor(tmp))
    expect(result.status).toBe('pass')
    expect((result.details as { present: string[] }).present).toContain(
      '.env.local',
    )
  })
})
