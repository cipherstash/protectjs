import type { Check } from '../../types.js'

export const configStashConfigPresent: Check = {
  id: 'config.stash-config-present',
  title: 'stash.config.ts exists',
  category: 'config',
  severity: 'error',
  async run({ cache }) {
    const result = await cache.stashConfig()
    if (result.ok) {
      return {
        status: 'pass',
        message: `Found at ${result.configPath}`,
        details: { configPath: result.configPath },
      }
    }
    if (result.reason === 'not-found') {
      return {
        status: 'fail',
        message:
          'stash.config.ts not found in project root (searched upward from cwd)',
        fixHint:
          'Run `stash init` or `stash db install --config-only` to create one.',
      }
    }
    // import-failed / invalid still mean the file was found — delegate to the
    // downstream validity check for diagnosis. Don't block dependent checks.
    return {
      status: 'pass',
      message:
        'configPath' in result ? `Found at ${result.configPath}` : 'Found',
    }
  },
}
