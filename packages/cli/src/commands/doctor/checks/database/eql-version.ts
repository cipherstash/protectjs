import { EQLInstaller, loadBundledEqlSql } from '@/installer/index.js'
import type { Check } from '../../types.js'

/**
 * Extract the version string from the bundled EQL SQL.
 *
 * The install script contains a generated `eql_v2.version()` function whose
 * body returns a literal like `'eql-2.2.1'`. We pull that out at runtime so
 * doctor can diff against whatever is live in the database.
 */
function bundledEqlVersion(): string | undefined {
  let sql: string
  try {
    sql = loadBundledEqlSql()
  } catch {
    return undefined
  }
  const match = sql.match(/SELECT\s+'(eql-[^']+)'/i)
  return match ? match[1] : undefined
}

export const databaseEqlVersion: Check = {
  id: 'database.eql-version',
  title: 'Installed EQL matches bundled version',
  category: 'database',
  severity: 'warn',
  dependsOn: ['database.eql-installed'],
  async run({ cache, flags }) {
    if (flags.skipDb) return { status: 'skip', message: '--skip-db' }
    const result = await cache.stashConfig()
    if (!result.ok) return { status: 'skip' }

    const installer = new EQLInstaller({
      databaseUrl: result.config.databaseUrl,
    })
    const installedVersion = await installer.getInstalledVersion()
    const bundled = bundledEqlVersion()

    if (installedVersion === null) {
      return { status: 'skip', message: 'EQL not installed' }
    }
    if (installedVersion === 'unknown') {
      return {
        status: 'pass',
        message: 'installed version unknown (older EQL build)',
        details: { installed: installedVersion, bundled },
      }
    }
    if (!bundled) {
      return {
        status: 'pass',
        message: `installed: ${installedVersion} (bundled version not detectable)`,
        details: { installed: installedVersion },
      }
    }
    if (installedVersion === bundled) {
      return {
        status: 'pass',
        message: installedVersion,
        details: { installed: installedVersion, bundled },
      }
    }
    return {
      status: 'fail',
      message: `installed ${installedVersion} differs from bundled ${bundled}`,
      fixHint: 'Run: stash db install',
      details: { installed: installedVersion, bundled },
    }
  },
}
