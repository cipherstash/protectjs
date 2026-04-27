import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { projectStackInstalled } from '../../checks/project/stack-installed.js'
import type { CheckContext, PackageJson } from '../../types.js'

function makeCtx(pkg: PackageJson | undefined): CheckContext {
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
      integration: () => undefined,
      hasTypeScript: () => false,
    },
  }
}

describe('project.stack-installed', () => {
  let originalUa: string | undefined
  beforeEach(() => {
    originalUa = process.env.npm_config_user_agent
    delete process.env.npm_config_user_agent
  })
  afterEach(() => {
    if (originalUa === undefined) delete process.env.npm_config_user_agent
    else process.env.npm_config_user_agent = originalUa
  })

  it('passes when @cipherstash/stack is in dependencies', async () => {
    const result = await projectStackInstalled.run(
      makeCtx({ dependencies: { '@cipherstash/stack': '^0.6.0' } }),
    )
    expect(result.status).toBe('pass')
  })

  it('passes when @cipherstash/stack is in devDependencies', async () => {
    const result = await projectStackInstalled.run(
      makeCtx({ devDependencies: { '@cipherstash/stack': '^0.6.0' } }),
    )
    expect(result.status).toBe('pass')
  })

  it('fails when @cipherstash/stack is missing', async () => {
    const result = await projectStackInstalled.run(
      makeCtx({ dependencies: { express: '*' } }),
    )
    expect(result.status).toBe('fail')
    expect(result.fixHint).toContain('@cipherstash/stack')
  })

  it('fails when package.json could not be read', async () => {
    const result = await projectStackInstalled.run(makeCtx(undefined))
    expect(result.status).toBe('fail')
  })
})
