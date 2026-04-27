import type { Check } from '../../types.js'

export const configEncryptionClientHasTables: Check = {
  id: 'config.encryption-client-has-tables',
  title: 'Encryption client defines at least one table',
  category: 'config',
  severity: 'warn',
  dependsOn: ['config.encryption-client-loadable'],
  async run({ cache }) {
    const result = await cache.encryptClient()
    if (!result.ok) return { status: 'skip' }
    if (result.tableCount > 0) {
      return {
        status: 'pass',
        message: `${result.tableCount} encrypted ${result.tableCount === 1 ? 'table' : 'tables'}`,
        details: { tableCount: result.tableCount },
      }
    }
    return {
      status: 'fail',
      message: 'No encrypted tables defined',
      fixHint:
        'Define at least one encrypted table — see the docs, or run `stash wizard` to scaffold one.',
    }
  },
}
