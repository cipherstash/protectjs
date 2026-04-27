import { pmForHints } from '../../lib/package-manager.js'
import { hasDependency } from '../../lib/package.js'
import type { Check } from '../../types.js'

export const projectCliInstalled: Check = {
  id: 'project.cli-installed',
  title: '@cipherstash/cli installed as devDependency',
  category: 'project',
  severity: 'warn',
  dependsOn: ['project.package-json'],
  async run({ cwd, cache }) {
    const pkg = cache.packageJson()
    if (hasDependency(pkg, '@cipherstash/cli')) {
      return { status: 'pass' }
    }
    const pm = pmForHints(cwd)
    return {
      status: 'fail',
      message: '@cipherstash/cli is not installed in this project',
      fixHint: `Invoking via npx works, but installing locally pins the version. Run: ${pm.installDev('@cipherstash/cli')}`,
      details: { packageManager: pm.name },
    }
  },
}
