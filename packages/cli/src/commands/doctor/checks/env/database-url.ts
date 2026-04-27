import type { Check } from '../../types.js'

export const envDatabaseUrl: Check = {
  id: 'env.database-url',
  title: 'DATABASE_URL is set',
  category: 'env',
  severity: 'error',
  async run() {
    const value = process.env.DATABASE_URL
    if (value && value.length > 0) {
      return { status: 'pass' }
    }
    return {
      status: 'fail',
      message: 'DATABASE_URL is not set in the environment',
      fixHint:
        'Add DATABASE_URL to .env (dotenv loads it automatically on CLI startup).',
    }
  },
}
