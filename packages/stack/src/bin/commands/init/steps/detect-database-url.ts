import * as p from '@clack/prompts'
import type { InitStep, InitState, InitProvider } from '../types.js'
import { CancelledError } from '../types.js'

function maskUrl(url: string): string {
  return url.replace(/:\/\/([^:]+):([^@]+)@/, '://***@')
}

export const detectDatabaseUrlStep: InitStep = {
  id: 'detect-database-url',
  name: 'Detect database URL',
  async run(state: InitState, _provider: InitProvider): Promise<InitState> {
    const envUrl = process.env.DATABASE_URL

    if (envUrl) {
      p.log.success(`Detected DATABASE_URL in .env\n  ${maskUrl(envUrl)}`)
      return { ...state, databaseUrl: envUrl }
    }

    p.log.warn('No DATABASE_URL found in .env')

    const action = await p.select({
      message: 'How would you like to proceed?',
      options: [
        { value: 'enter', label: 'Enter database URL now' },
        { value: 'skip', label: 'Skip for now (I\'ll add it later)' },
      ],
    })

    if (p.isCancel(action)) throw new CancelledError()

    if (action === 'enter') {
      const url = await p.text({
        message: 'Enter your database URL:',
        placeholder: 'postgresql://user:password@host:5432/database',
        validate: (val) => {
          if (!val.trim()) return 'Database URL is required'
          if (!val.startsWith('postgres')) return 'Must be a PostgreSQL connection string'
        },
      })

      if (p.isCancel(url)) throw new CancelledError()

      return { ...state, databaseUrl: url }
    }

    return state
  },
}
