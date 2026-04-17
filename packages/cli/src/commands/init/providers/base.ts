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
      const steps = ['Set up your database: npx @cipherstash/cli db install']

      const manualEdit = state.clientFilePath
        ? `edit ${state.clientFilePath} directly`
        : 'edit your encryption schema directly'
      steps.push(
        `Customize your schema: npx @cipherstash/cli wizard (AI-guided, automated) — or ${manualEdit}`,
      )

      steps.push('Quickstart: https://cipherstash.com/docs/stack/quickstart')
      steps.push('Dashboard: https://dashboard.cipherstash.com/workspaces')

      return steps
    },
  }
}
