import type { InitProvider, InitState } from '../types.js'

export function createBaseProvider(): InitProvider {
  return {
    name: 'base',
    introMessage: 'Setting up CipherStash for your project...',
    connectionOptions: [
      { value: 'drizzle', label: 'Drizzle ORM' },
      { value: 'supabase-js', label: 'Supabase JS Client' },
      { value: 'prisma', label: 'Prisma' },
      { value: 'raw-sql', label: 'Raw SQL / pg' },
    ],
    getNextSteps(state: InitState): string[] {
      const steps = ['Set up your database: npx stash-forge setup']

      if (state.clientFilePath) {
        steps.push(`Edit your encryption schema: ${state.clientFilePath}`)
      }

      steps.push('Read the docs: https://cipherstash.com/docs')

      return steps
    },
  }
}
