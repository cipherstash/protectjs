import type { Check } from '../../types.js'

export const projectTypescript: Check = {
  id: 'project.typescript',
  title: 'TypeScript detected',
  category: 'project',
  severity: 'info',
  dependsOn: ['project.package-json'],
  async run({ cache }) {
    if (cache.hasTypeScript()) {
      return { status: 'pass' }
    }
    return {
      status: 'fail',
      message:
        'TypeScript not detected — type safety for encrypted schemas will not be enforced',
      fixHint:
        'Add typescript to devDependencies or create a tsconfig.json to opt in.',
    }
  },
}
