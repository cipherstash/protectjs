import type { Check } from '../../types.js'

export const configStashConfigValid: Check = {
  id: 'config.stash-config-valid',
  title: 'stash.config.ts is valid',
  category: 'config',
  severity: 'error',
  dependsOn: ['config.stash-config-present'],
  async run({ cache }) {
    const result = await cache.stashConfig()
    if (result.ok) {
      return { status: 'pass' }
    }
    if (result.reason === 'not-found') {
      // Covered by the present check; this path is pruned by dependsOn but
      // handle defensively.
      return { status: 'skip' }
    }
    if (result.reason === 'import-failed') {
      return {
        status: 'fail',
        message: `Failed to load ${result.configPath}`,
        fixHint:
          'Fix the error above — commonly a syntax error or a missing import.',
        details: { configPath: result.configPath },
        cause: result.cause,
      }
    }
    return {
      status: 'fail',
      message: `Invalid stash.config.ts — ${result.issues.length} issue(s)`,
      fixHint: result.issues
        .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
        .join('\n'),
      details: {
        configPath: result.configPath,
        issues: result.issues.map((i) => ({
          path: i.path.map((p) => String(p)),
          message: i.message,
        })),
      },
    }
  },
}
