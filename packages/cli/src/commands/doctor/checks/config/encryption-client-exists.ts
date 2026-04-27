import { existsSync } from 'node:fs'
import path from 'node:path'
import type { Check } from '../../types.js'

export const configEncryptionClientExists: Check = {
  id: 'config.encryption-client-exists',
  title: 'Encryption client file exists',
  category: 'config',
  severity: 'error',
  dependsOn: ['config.stash-config-valid'],
  async run({ cwd, cache }) {
    const result = await cache.stashConfig()
    if (!result.ok) return { status: 'skip' }
    const resolvedPath = path.resolve(cwd, result.config.client)
    if (existsSync(resolvedPath)) {
      return { status: 'pass', details: { resolvedPath } }
    }
    return {
      status: 'fail',
      message: `Encryption client file not found: ${resolvedPath}`,
      fixHint:
        'Run `stash wizard` to generate one, or update `client` in stash.config.ts to point at an existing file.',
      details: { resolvedPath, configured: result.config.client },
    }
  },
}
