import type { InitProvider, InitState } from '../types.js'

export function createDrizzleProvider(): InitProvider {
  return {
    name: 'drizzle',
    introMessage: 'Setting up CipherStash for your Drizzle project...',
    getNextSteps(state: InitState): string[] {
      const steps = ['Set up your database: npx @cipherstash/cli db install --drizzle']

      const manualEdit = state.clientFilePath
        ? `edit ${state.clientFilePath} directly`
        : 'edit your encryption schema directly'
      steps.push(
        `Customize your schema: npx @cipherstash/wizard (AI-guided, automated) — or ${manualEdit}`,
      )

      steps.push(
        'Drizzle guide: https://cipherstash.com/docs/stack/cipherstash/encryption/drizzle',
        'Dashboard: https://dashboard.cipherstash.com/workspaces',
        'Need help? Discord or support@cipherstash.com',
      )

      return steps
    },
  }
}
