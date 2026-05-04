import * as p from '@clack/prompts'
import {
  CancelledError,
  type HandoffChoice,
  type InitProvider,
  type InitState,
  type InitStep,
} from '../types.js'
import { handoffAgentsMdStep } from './handoff-agents-md.js'
import { handoffClaudeStep } from './handoff-claude.js'
import { handoffCodexStep } from './handoff-codex.js'
import { handoffWizardStep } from './handoff-wizard.js'

/**
 * Pick the default option in the four-way menu.
 *
 * Detected CLIs win — Claude Code first, then Codex. Otherwise we default to
 * the AGENTS.md path because that's the broadest "works without anything else
 * installed" option. The CipherStash Agent option is positioned as a fallback
 * (slow first run, requires the wizard package on top of the CLI) and is
 * never selected by default.
 */
function defaultChoice(state: InitState): HandoffChoice {
  if (state.agents?.cli.claudeCode) return 'claude-code'
  if (state.agents?.cli.codex) return 'codex'
  return 'agents-md'
}

/**
 * Build the option list for the four-way menu. Hints reflect detection state
 * — a missing CLI doesn't hide the option (handoff steps still write the
 * rules files and print install instructions), it just nudges the user.
 */
function buildOptions(
  state: InitState,
): { value: HandoffChoice; label: string; hint?: string }[] {
  const claudeHint = state.agents?.cli.claudeCode
    ? 'claude detected — will launch interactively'
    : 'claude not on PATH — files will be written, install link shown'
  const codexHint = state.agents?.cli.codex
    ? 'codex detected — will launch interactively'
    : 'codex not on PATH — files will be written, install link shown'

  return [
    {
      value: 'claude-code',
      label: 'Hand off to Claude Code',
      hint: claudeHint,
    },
    {
      value: 'codex',
      label: 'Hand off to Codex',
      hint: codexHint,
    },
    {
      value: 'wizard',
      label: 'Use the CipherStash Agent',
      hint: 'our hosted setup wizard (runs `stash wizard`)',
    },
    {
      value: 'agents-md',
      label: 'Write AGENTS.md',
      hint: 'works with Cursor, Windsurf, Cline, and more',
    },
  ]
}

export const howToProceedStep: InitStep = {
  id: 'how-to-proceed',
  name: 'How to proceed',
  async run(state: InitState, provider: InitProvider): Promise<InitState> {
    const choice = await p.select<HandoffChoice>({
      message: 'How would you like to finish setup?',
      options: buildOptions(state),
      initialValue: defaultChoice(state),
    })

    if (p.isCancel(choice)) throw new CancelledError()

    const next: InitState = { ...state, handoff: choice }

    switch (choice) {
      case 'claude-code':
        return handoffClaudeStep.run(next, provider)
      case 'codex':
        return handoffCodexStep.run(next, provider)
      case 'agents-md':
        return handoffAgentsMdStep.run(next, provider)
      case 'wizard':
        return handoffWizardStep.run(next, provider)
    }
  },
}
