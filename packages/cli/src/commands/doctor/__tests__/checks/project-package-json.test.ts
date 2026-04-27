import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { projectPackageJson } from '../../checks/project/package-json.js'
import type { CheckContext } from '../../types.js'

function makeCtx(cwd: string): CheckContext {
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

describe('project.package-json', () => {
  let tmp: string

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'doctor-test-'))
  })
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  it('fails when package.json is missing', async () => {
    const result = await projectPackageJson.run(makeCtx(tmp))
    expect(result.status).toBe('fail')
    expect(result.message).toContain('package.json')
  })

  it('fails when package.json is invalid JSON', async () => {
    writeFileSync(join(tmp, 'package.json'), '{ not json }')
    const result = await projectPackageJson.run(makeCtx(tmp))
    expect(result.status).toBe('fail')
    expect(result.message).toContain('valid JSON')
  })

  it('passes when package.json is valid', async () => {
    writeFileSync(join(tmp, 'package.json'), '{"name":"ok"}')
    const result = await projectPackageJson.run(makeCtx(tmp))
    expect(result.status).toBe('pass')
  })
})
