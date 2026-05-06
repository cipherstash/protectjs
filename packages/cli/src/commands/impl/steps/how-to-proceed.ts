import * as p from '@clack/prompts'
import {
  CancelledError,
  type HandoffChoice,
  type HandoffStep,
  type InitMode,
  type InitState,
} from '../../init/types.js'
import { handoffAgentsMdStep } from './handoff-agents-md.js'
import { handoffClaudeStep } from './handoff-claude.js'
import { handoffCodexStep } from './handoff-codex.js'
import { handoffWizardStep } from './handoff-wizard.js'

/**
 * Pick the default option in the menu.
 *
 * Detected CLIs win — Claude Code first, then Codex. Otherwise we default to
 * the AGENTS.md path because that's the broadest "works without anything else
 * installed" option. The CipherStash Agent option is positioned as a fallback
 * (slow first run, requires the wizard package on top of the CLI) and is
 * never selected by default. In plan mode, AGENTS.md and wizard aren't
 * offered — the default falls back to `claude-code`.
 */
export function defaultChoice(state: InitState, mode: InitMode): HandoffChoice {
  if (state.agents?.cli.claudeCode) return 'claude-code'
  if (state.agents?.cli.codex) return 'codex'
  return mode === 'plan' ? 'claude-code' : 'agents-md'
}

/**
 * Build the option list for the menu. Hints reflect detection state — a
 * missing CLI doesn't hide the option (handoff steps still write the
 * rules files and print install instructions), it just nudges the user.
 *
 * In plan mode we only offer Claude Code and Codex. AGENTS.md and the
 * wizard don't yet have planning prompt templates, so suppress them
 * entirely rather than degrading silently.
 */
export function buildOptions(
  state: InitState,
  mode: InitMode,
): { value: HandoffChoice; label: string; hint?: string }[] {
  const claudeHint = state.agents?.cli.claudeCode
    ? 'claude detected — will launch interactively'
    : 'claude not on PATH — files will be written, install link shown'
  const codexHint = state.agents?.cli.codex
    ? 'codex detected — will launch interactively'
    : 'codex not on PATH — files will be written, install link shown'

  const options: { value: HandoffChoice; label: string; hint?: string }[] = [
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
  ]

  if (mode === 'implement') {
    options.push(
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
    )
  }

  return options
}

export const howToProceedStep: HandoffStep = {
  id: 'how-to-proceed',
  name: 'How to proceed',
  async run(state: InitState): Promise<InitState> {
    const mode: InitMode = state.mode ?? 'implement'
    const message =
      mode === 'plan'
        ? 'Which agent should write the plan?'
        : 'How would you like to finish setup?'

    const choice = await p.select<HandoffChoice>({
      message,
      options: buildOptions(state, mode),
      initialValue: defaultChoice(state, mode),
    })

    if (p.isCancel(choice)) throw new CancelledError()

    const next: InitState = { ...state, handoff: choice }

    switch (choice) {
      case 'claude-code':
        return handoffClaudeStep.run(next)
      case 'codex':
        return handoffCodexStep.run(next)
      case 'agents-md':
        return handoffAgentsMdStep.run(next)
      case 'wizard':
        return handoffWizardStep.run(next)
    }
  },
}
