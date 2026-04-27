import type { Check } from '../../types.js'

export const projectIntegrationDetected: Check = {
  id: 'project.integration-detected',
  title: 'ORM integration detected',
  category: 'project',
  severity: 'info',
  dependsOn: ['project.package-json'],
  async run({ cache }) {
    const integration = cache.integration()
    if (integration) {
      return {
        status: 'pass',
        message: `Detected: ${integration}`,
        details: { integration },
      }
    }
    return {
      status: 'fail',
      message: 'No integration detected — using generic Postgres client',
      fixHint:
        'If you use Drizzle, Supabase, or Prisma, install its package to enable integration-specific checks.',
    }
  },
}
