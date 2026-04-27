import { EQLInstaller } from '@/installer/index.js'
import type { Check } from '../../types.js'

export const databaseRolePermissions: Check = {
  id: 'database.role-permissions',
  title: 'Database role has required permissions',
  category: 'database',
  severity: 'warn',
  dependsOn: ['database.connects'],
  async run({ cache, flags }) {
    if (flags.skipDb) return { status: 'skip', message: '--skip-db' }
    const result = await cache.stashConfig()
    if (!result.ok) return { status: 'skip' }

    const installer = new EQLInstaller({
      databaseUrl: result.config.databaseUrl,
    })
    const permissions = await installer.checkPermissions()
    if (permissions.ok) {
      return {
        status: 'pass',
        details: { isSuperuser: permissions.isSuperuser },
      }
    }
    return {
      status: 'fail',
      message: `Role is missing ${permissions.missing.length} permission(s)`,
      fixHint: permissions.missing.map((m) => `  - ${m}`).join('\n'),
      details: { missing: permissions.missing },
    }
  },
}
