import * as p from '@clack/prompts'
import { PLAN_REL_PATH } from '../lib/setup-prompt.js'
import type { InitProvider, InitState, InitStep } from '../types.js'
import { detectPackageManager, runnerCommand } from '../utils.js'

export const nextStepsStep: InitStep = {
  id: 'next-steps',
  name: 'Next steps',
  async run(state: InitState, provider: InitProvider): Promise<InitState> {
    const pm = detectPackageManager()

    if (state.mode === 'plan') {
      const cli = runnerCommand(pm, 'stash')
      p.note(
        [
          `1. Review ${PLAN_REL_PATH} (the agent should have written it, or be writing it now).`,
          `2. When the plan looks right, re-run \`${cli} init\` and pick "Go straight to implementation".`,
          '3. Quickstart: https://cipherstash.com/docs/stack/quickstart',
        ].join('\n'),
        'Next Steps — plan mode',
      )
      return state
    }

    const steps = provider.getNextSteps(state, pm)
    const numbered = steps.map((s, i) => `${i + 1}. ${s}`).join('\n')
    p.note(numbered, 'Next Steps')
    return state
  },
}
