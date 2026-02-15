import type { InitProvider, InitState } from '../types.js'

export function createSupabaseProvider(): InitProvider {
  return {
    name: 'supabase',
    introMessage: 'Setting up CipherStash for your Supabase project...',
    connectionOptions: [
      { value: 'supabase-js', label: 'Supabase JS Client', hint: 'recommended' },
      { value: 'drizzle', label: 'Drizzle ORM' },
      { value: 'prisma', label: 'Prisma' },
      { value: 'raw-sql', label: 'Raw SQL / pg' },
    ],
    getNextSteps(state: InitState): string[] {
      const steps = [
        'Install @cipherstash/stack: npm install @cipherstash/stack',
      ]

      if (state.connectionMethod === 'supabase-js') {
        steps.push('Import encryptedSupabase from @cipherstash/stack/supabase')
      } else if (state.connectionMethod === 'drizzle') {
        steps.push('Import encryptedType from @cipherstash/stack/drizzle')
      } else if (state.connectionMethod === 'prisma') {
        steps.push('Set up Prisma with @cipherstash/stack')
      }

      steps.push(
        'Define your encrypted schema',
        'Supabase guides: https://cipherstash.com/docs/supabase/encrypt-user-data',
        'Multi-tenant encryption: https://docs.cipherstash.com/docs/multi-tenant',
        'Migrating existing data: https://docs.cipherstash.com/docs/migration',
        'Need help? #supabase in Discord or support@cipherstash.com',
      )

      return steps
    },
  }
}
