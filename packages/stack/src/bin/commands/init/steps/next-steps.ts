import * as p from '@clack/prompts'
import type { InitStep, InitState, InitProvider } from '../types.js'

export const nextStepsStep: InitStep = {
  id: 'next-steps',
  name: 'Next steps',
  async run(state: InitState, provider: InitProvider): Promise<InitState> {
    const steps = provider.getNextSteps(state)
    const numbered = steps.map((s, i) => `${i + 1}. ${s}`).join('\n')
    p.note(numbered, 'Next Steps')
    return state
  },
}
