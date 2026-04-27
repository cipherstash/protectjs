import pg from 'pg'
import type { Check } from '../../types.js'

export const databaseConnects: Check = {
  id: 'database.connects',
  title: 'Database connection succeeds',
  category: 'database',
  severity: 'error',
  dependsOn: ['config.database-url-set'],
  async run({ cache, flags }) {
    if (flags.skipDb) {
      return { status: 'skip', message: '--skip-db' }
    }
    const result = await cache.stashConfig()
    if (!result.ok) return { status: 'skip' }

    const client = new pg.Client({
      connectionString: result.config.databaseUrl,
    })
    try {
      await client.connect()
      return { status: 'pass' }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      return {
        status: 'fail',
        message: `Failed to connect to database: ${message}`,
        fixHint:
          'Check DATABASE_URL, network connectivity, and that Postgres is reachable from this machine.',
        cause,
      }
    } finally {
      await client.end().catch(() => {
        /* client was never connected */
      })
    }
  },
}
