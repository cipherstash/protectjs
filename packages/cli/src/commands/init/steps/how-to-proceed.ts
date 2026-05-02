import * as p from '@clack/prompts'
import { shouldOfferClaudeCode } from '../detect-agents.js'
import {
  CancelledError,
  type HandoffChoice,
  type InitProvider,
  type InitState,
  type InitStep,
} from '../types.js'
import { handoffClaudeStep } from './handoff-claude.js'

/**
 * Ask the user how they want to finish setup, then dispatch.
 *
 * - Claude Code handoff is offered as the default when `claude` is on PATH.
 * - The built-in wizard option points the user at `stash wizard` rather than
 *   running it inline; the wizard is a separate command and Phase 1 keeps
 *   that boundary intact.
 * - "Just write the rules files" is always offered as the no-spawn escape
 *   hatch for users who drive their own agent (Codex / Cursor / hand-rolled).
 */
export const howToProceedStep: InitStep = {
  id: 'how-to-proceed',
  name: 'How to proceed',
  async run(state: InitState, _provider: InitProvider): Promise<InitState> {
    const claudeAvailable = state.agents
      ? shouldOfferClaudeCode(state.agents)
      : false

    const options: { value: HandoffChoice; label: string; hint?: string }[] = []

    if (claudeAvailable) {
      options.push({
        value: 'claude-code',
        label: 'Hand off to Claude Code',
        hint: 'install a project skill, then launch `claude` interactively',
      })
    }

    options.push({
      value: 'rules-only',
      label: 'Just write the rules files',
      hint: 'I will drive my own agent (Codex / Cursor / etc.)',
    })

    options.push({
      value: 'wizard',
      label: "Use CipherStash's built-in wizard",
      hint: 'run `stash wizard` after init finishes',
    })

    const choice = await p.select<HandoffChoice>({
      message: 'How would you like to finish setup?',
      options,
      initialValue: claudeAvailable ? 'claude-code' : 'rules-only',
    })

    if (p.isCancel(choice)) throw new CancelledError()

    const next: InitState = { ...state, handoff: choice }

    if (choice === 'claude-code') {
      return handoffClaudeStep.run(next, _provider)
    }

    if (choice === 'rules-only') {
      // Rules-only path still installs the project skill so Codex / Cursor /
      // hand-rolled agents can be pointed at .claude/skills/cipherstash-setup
      // (or read it directly). Same writer, no spawn.
      return handoffClaudeStep.run(
        { ...next, handoff: 'rules-only' },
        _provider,
      )
    }

    p.log.info(
      'When you are ready, run `stash wizard` to launch the built-in setup agent.',
    )
    return next
  },
}
