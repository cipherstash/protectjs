import type { InitProvider, InitState } from '../types.js'

export function createBaseProvider(): InitProvider {
  return {
    name: 'base',
    introMessage: 'Setting up CipherStash for your project...',
    getNextSteps(state: InitState): string[] {
      const manualEdit = state.clientFilePath
        ? `edit ${state.clientFilePath} directly`
        : 'edit your encryption schema directly'
      return [
        'Set up your database: npx @cipherstash/cli db install',
        `Customize your schema: npx @cipherstash/wizard (AI-guided, automated) — or ${manualEdit}`,
        'Quickstart: https://cipherstash.com/docs/stack/quickstart',
        'Dashboard: https://dashboard.cipherstash.com/workspaces',
      ]
    },
  }
}
