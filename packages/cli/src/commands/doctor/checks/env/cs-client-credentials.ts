import type { Check } from '../../types.js'

const REQUIRED_VARS = [
  'CS_CLIENT_ID',
  'CS_CLIENT_KEY',
  'CS_CLIENT_ACCESS_KEY',
] as const

export const envCsClientCredentials: Check = {
  id: 'env.cs-client-credentials',
  title: 'CS_CLIENT_* credentials are set',
  category: 'env',
  severity: 'info',
  async run() {
    const missing = REQUIRED_VARS.filter((name) => !process.env[name])
    if (missing.length === 0) {
      return { status: 'pass' }
    }
    return {
      status: 'fail',
      message: `Missing: ${missing.join(', ')}`,
      fixHint:
        'Required in production / CI. For local dev the device-code auth in ~/.cipherstash/ supplies these — safe to ignore locally.',
      details: { missing: [...missing] },
    }
  },
}
