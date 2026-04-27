import type { Check } from '../../types.js'

export const configDatabaseUrlSet: Check = {
  id: 'config.database-url-set',
  title: 'config.databaseUrl resolves',
  category: 'config',
  severity: 'error',
  dependsOn: ['config.stash-config-valid'],
  async run({ cache }) {
    const result = await cache.stashConfig()
    if (!result.ok) {
      return { status: 'skip' }
    }
    const url = result.config.databaseUrl
    if (typeof url !== 'string' || url.length === 0) {
      return {
        status: 'fail',
        message:
          'databaseUrl is empty — likely process.env.DATABASE_URL was not set when the config loaded',
        fixHint:
          'Set DATABASE_URL in .env or hardcode the connection string in stash.config.ts.',
      }
    }
    return { status: 'pass' }
  },
}
