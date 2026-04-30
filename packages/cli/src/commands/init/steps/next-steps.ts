import * as p from '@clack/prompts'
import type { InitProvider, InitState, InitStep } from '../types.js'
import { detectPackageManager } from '../utils.js'

export const nextStepsStep: InitStep = {
  id: 'next-steps',
  name: 'Next steps',
  async run(state: InitState, provider: InitProvider): Promise<InitState> {
    const pm = detectPackageManager()
    const steps = provider.getNextSteps(state, pm)
    const numbered = steps.map((s, i) => `${i + 1}. ${s}`).join('\n')
    p.note(numbered, 'Next Steps')
    return state
  },
}
