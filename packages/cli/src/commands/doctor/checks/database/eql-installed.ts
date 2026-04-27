import { EQLInstaller } from '@/installer/index.js'
import type { Check } from '../../types.js'

export const databaseEqlInstalled: Check = {
  id: 'database.eql-installed',
  title: 'EQL is installed',
  category: 'database',
  severity: 'error',
  dependsOn: ['database.connects'],
  async run({ cache, flags }) {
    if (flags.skipDb) return { status: 'skip', message: '--skip-db' }
    const result = await cache.stashConfig()
    if (!result.ok) return { status: 'skip' }

    const installer = new EQLInstaller({
      databaseUrl: result.config.databaseUrl,
    })
    const installed = await installer.isInstalled()
    if (installed) {
      return { status: 'pass' }
    }
    return {
      status: 'fail',
      message: 'EQL schema `eql_v2` is not installed',
      fixHint: 'Run: stash db install',
    }
  },
}
