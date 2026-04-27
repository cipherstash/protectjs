import { existsSync } from 'node:fs'
import path from 'node:path'
import type { Check } from '../../types.js'

export const integrationDrizzleMigrationsDir: Check = {
  id: 'integration.drizzle.migrations-dir',
  title: 'Drizzle migrations directory exists',
  category: 'integration',
  severity: 'info',
  dependsOn: ['project.integration-detected'],
  async run({ cwd, cache }) {
    if (cache.integration() !== 'drizzle') {
      return { status: 'skip', message: 'integration is not drizzle' }
    }
    const dir = path.resolve(cwd, 'drizzle')
    if (existsSync(dir)) {
      return { status: 'pass', details: { dir } }
    }
    return {
      status: 'fail',
      message: './drizzle/ not found',
      fixHint:
        'OK if you have not generated migrations yet. Run `drizzle-kit generate` when you are ready.',
    }
  },
}
