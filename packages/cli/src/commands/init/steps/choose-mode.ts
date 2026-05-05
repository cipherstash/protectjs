import * as p from '@clack/prompts'
import {
  CancelledError,
  type InitMode,
  type InitProvider,
  type InitState,
  type InitStep,
} from '../types.js'

/**
 * Ask the user whether the agent handoff should produce a plan first or
 * go straight to implementation. Plan-first is the default — for
 * migrate-existing-column work the wrong order of operations is hard to
 * recover from, so a reviewable plan checkpoint is the safer default.
 *
 * Plan mode currently routes only to Claude Code or Codex. The next step
 * (`how-to-proceed`) reads `state.mode` and filters its target list
 * accordingly.
 */
export const chooseModeStep: InitStep = {
  id: 'choose-mode',
  name: 'Choose mode',
  async run(state: InitState, _provider: InitProvider): Promise<InitState> {
    const mode = await p.select<InitMode>({
      message: 'Plan first, or go straight to implementation?',
      options: [
        {
          value: 'plan',
          label: 'Write a plan first (recommended)',
          hint: 'agent produces .cipherstash/plan.md for review — Claude Code or Codex only',
        },
        {
          value: 'implement',
          label: 'Go straight to implementation',
          hint: 'agent makes schema and code changes directly',
        },
      ],
      initialValue: 'plan',
    })

    if (p.isCancel(mode)) throw new CancelledError()

    return { ...state, mode }
  },
}
