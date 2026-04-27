import { describe, expect, it } from 'vitest'
import { projectNodeVersion } from '../../checks/project/node-version.js'
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

describe('project.node-version', () => {
  it('passes on the current test runtime (Node 22+)', async () => {
    // The package engines enforce Node 22+, so tests always run on a pass.
    const result = await projectNodeVersion.run(ctx)
    expect(result.status).toBe('pass')
  })
})
