import { pmForHints } from '../../lib/package-manager.js'
import { hasDependency } from '../../lib/package.js'
import type { Check } from '../../types.js'

export const projectStackInstalled: Check = {
  id: 'project.stack-installed',
  title: '@cipherstash/stack installed',
  category: 'project',
  severity: 'error',
  dependsOn: ['project.package-json'],
  async run({ cwd, cache }) {
    const pkg = cache.packageJson()
    if (hasDependency(pkg, '@cipherstash/stack')) {
      return { status: 'pass' }
    }
    const pm = pmForHints(cwd)
    return {
      status: 'fail',
      message: '@cipherstash/stack is not in dependencies or devDependencies',
      fixHint: `Run: ${pm.install('@cipherstash/stack')}`,
      details: { packageManager: pm.name },
    }
  },
}
