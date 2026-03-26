import type { InitProvider, InitState } from '../types.js'

export function createSupabaseProvider(): InitProvider {
  return {
    name: 'supabase',
    introMessage: 'Setting up CipherStash for your Supabase project...',
    connectionOptions: [
      {
        value: 'supabase-js',
        label: 'Supabase JS Client',
        hint: 'recommended',
      },
      { value: 'drizzle', label: 'Drizzle ORM' },
      { value: 'prisma', label: 'Prisma' },
      { value: 'raw-sql', label: 'Raw SQL / pg' },
    ],
    getNextSteps(state: InitState): string[] {
      const steps = ['Set up your database: npx stash-forge setup']

      if (state.clientFilePath) {
        steps.push(`Edit your encryption schema: ${state.clientFilePath}`)
      }

      steps.push(
        'Supabase guides: https://cipherstash.com/docs/stack/encryption/supabase',
        'Need help? #supabase in Discord or support@cipherstash.com',
      )

      return steps
    },
  }
}
