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
      const steps = [
        'Set up your database: npx @cipherstash/cli db install --supabase',
      ]

      const manualEdit = state.clientFilePath
        ? `edit ${state.clientFilePath} directly`
        : 'edit your encryption schema directly'
      steps.push(
        `Customize your schema: npx @cipherstash/cli wizard (AI-guided, automated) — or ${manualEdit}`,
      )

      steps.push(
        'Supabase guide: https://cipherstash.com/docs/stack/cipherstash/supabase',
        'Dashboard: https://dashboard.cipherstash.com/workspaces',
        'Need help? #supabase in Discord or support@cipherstash.com',
      )

      return steps
    },
  }
}
