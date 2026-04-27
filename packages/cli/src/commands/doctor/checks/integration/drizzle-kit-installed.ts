import { pmForHints } from '../../lib/package-manager.js'
import { hasDependency } from '../../lib/package.js'
import type { Check } from '../../types.js'

export const integrationDrizzleKitInstalled: Check = {
  id: 'integration.drizzle.kit-installed',
  title: 'drizzle-kit installed',
  category: 'integration',
  severity: 'warn',
  dependsOn: ['project.integration-detected'],
  async run({ cwd, cache }) {
    if (cache.integration() !== 'drizzle') {
      return { status: 'skip', message: 'integration is not drizzle' }
    }
    const pkg = cache.packageJson()
    if (hasDependency(pkg, 'drizzle-kit')) {
      return { status: 'pass' }
    }
    const pm = pmForHints(cwd)
    return {
      status: 'fail',
      message: 'drizzle-kit is not installed',
      fixHint: `Run: ${pm.installDev('drizzle-kit')}`,
    }
  },
}
