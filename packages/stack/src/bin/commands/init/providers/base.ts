import type { InitProvider, InitState } from '../types.js'

export function createBaseProvider(): InitProvider {
  return {
    name: 'base',
    introMessage: 'Setting up CipherStash for your project...',
    connectionOptions: [
      { value: 'drizzle', label: 'Drizzle ORM', hint: 'recommended' },
      { value: 'prisma', label: 'Prisma' },
      { value: 'raw-sql', label: 'Raw SQL / pg' },
    ],
    getNextSteps(state: InitState): string[] {
      const steps = [
        'Install @cipherstash/stack: npm install @cipherstash/stack',
      ]

      if (state.connectionMethod === 'drizzle') {
        steps.push('Import encryptedType from @cipherstash/stack/drizzle')
      } else if (state.connectionMethod === 'prisma') {
        steps.push('Set up Prisma with @cipherstash/stack')
      }

      steps.push(
        'Define your encrypted schema',
        'Read the docs: https://docs.cipherstash.com',
      )

      return steps
    },
  }
}
