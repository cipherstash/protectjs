import pg from 'pg'
import type { Check } from '../../types.js'

const REQUIRED_ROLES = ['anon', 'authenticated', 'service_role'] as const

export const integrationSupabaseGrants: Check = {
  id: 'integration.supabase.grants',
  title: 'Supabase roles have USAGE on eql_v2',
  category: 'integration',
  severity: 'warn',
  dependsOn: ['database.eql-installed', 'project.integration-detected'],
  async run({ cache, flags }) {
    if (flags.skipDb) return { status: 'skip', message: '--skip-db' }
    if (cache.integration() !== 'supabase') {
      return { status: 'skip', message: 'integration is not supabase' }
    }
    const result = await cache.stashConfig()
    if (!result.ok) return { status: 'skip' }

    const client = new pg.Client({
      connectionString: result.config.databaseUrl,
    })
    try {
      await client.connect()
      const missing: string[] = []
      for (const role of REQUIRED_ROLES) {
        const res = await client.query<{ has_usage: boolean }>(
          'SELECT has_schema_privilege($1, $2, $3) AS has_usage',
          [role, 'eql_v2', 'USAGE'],
        )
        if (!res.rows[0]?.has_usage) {
          missing.push(role)
        }
      }
      if (missing.length === 0) {
        return { status: 'pass' }
      }
      return {
        status: 'fail',
        message: `Missing USAGE on eql_v2 for: ${missing.join(', ')}`,
        fixHint: 'Run: stash db install --supabase',
        details: { missing },
      }
    } catch (cause) {
      return {
        status: 'fail',
        message:
          cause instanceof Error
            ? cause.message
            : 'Failed to introspect grants',
        cause,
      }
    } finally {
      await client.end().catch(() => {
        /* noop */
      })
    }
  },
}
