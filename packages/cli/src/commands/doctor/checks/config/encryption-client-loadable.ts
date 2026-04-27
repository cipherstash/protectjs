import type { Check } from '../../types.js'

export const configEncryptionClientLoadable: Check = {
  id: 'config.encryption-client-loadable',
  title: 'Encryption client module loads and exports an EncryptionClient',
  category: 'config',
  severity: 'error',
  dependsOn: ['config.encryption-client-exists'],
  async run({ cache }) {
    const result = await cache.encryptClient()
    if (result.ok) {
      return { status: 'pass', details: { resolvedPath: result.resolvedPath } }
    }
    if (result.reason === 'no-config' || result.reason === 'file-missing') {
      return { status: 'skip' }
    }
    if (result.reason === 'import-failed') {
      return {
        status: 'fail',
        message: `Failed to import ${result.resolvedPath}`,
        fixHint:
          'Fix the error above — commonly a missing @cipherstash/stack install, a bad import path, or a syntax error.',
        details: { resolvedPath: result.resolvedPath },
        cause: result.cause,
      }
    }
    return {
      status: 'fail',
      message: `No EncryptionClient export found in ${result.resolvedPath}`,
      fixHint:
        'Make sure the file exports an object with a `getEncryptConfig()` method — typically the return value of `Encryption({...})`.',
      details: { resolvedPath: result.resolvedPath },
    }
  },
}
