import { resolve } from 'node:path'
import * as p from '@clack/prompts'
import { fetchRulebook } from '../lib/fetch-rulebook.js'
import {
  CONTEXT_REL_PATH,
  SETUP_PROMPT_REL_PATH,
  buildContextFile,
  buildSetupPromptContext,
  readCliVersion,
  writeArtifact,
  writeContextFile,
  writeSetupPrompt,
} from '../lib/write-context.js'
import type { InitProvider, InitState, InitStep } from '../types.js'

const AGENTS_MD_REL_PATH = 'AGENTS.md'

/**
 * Write `AGENTS.md`, `.cipherstash/context.json`, and
 * `.cipherstash/setup-prompt.md`, then stop.
 *
 * For users running editor-based agents (Cursor, Windsurf, Cline) or any
 * tool that follows the AGENTS.md convention. We do not spawn anything —
 * the user opens their tool and the agent picks the file up from the
 * project root automatically. Pointing them at setup-prompt.md gives them
 * the project-specific action plan to copy into their first chat.
 */
export const handoffAgentsMdStep: InitStep = {
  id: 'handoff-agents-md',
  name: 'Write AGENTS.md',
  async run(state: InitState, _provider: InitProvider): Promise<InitState> {
    const cwd = process.cwd()
    const integration = state.integration ?? 'postgresql'
    const cliVersion = readCliVersion()
    const envKeys = state.envKeys ?? []

    const rulebookSpinner = p.spinner()
    rulebookSpinner.start('Fetching rulebook...')
    const rulebook = await fetchRulebook({
      integration,
      agent: 'codex',
      clientVersion: cliVersion,
    })
    rulebookSpinner.stop(
      rulebook.source === 'gateway'
        ? `Rulebook ${rulebook.rulebookVersion} fetched.`
        : `Rulebook ${rulebook.rulebookVersion} (bundled — gateway unavailable).`,
    )

    const agentsMdAbs = resolve(cwd, AGENTS_MD_REL_PATH)
    writeArtifact(agentsMdAbs, rulebook.body)
    p.log.success(`Wrote ${AGENTS_MD_REL_PATH}`)

    const contextAbs = resolve(cwd, CONTEXT_REL_PATH)
    const ctx = buildContextFile(state, rulebook.rulebookVersion)
    ctx.envKeys = envKeys
    writeContextFile(contextAbs, ctx)
    p.log.success(`Wrote ${CONTEXT_REL_PATH}`)

    const promptCtx = buildSetupPromptContext(state, 'agents-md')
    if (promptCtx) {
      writeSetupPrompt(resolve(cwd, SETUP_PROMPT_REL_PATH), promptCtx)
      p.log.success(`Wrote ${SETUP_PROMPT_REL_PATH}`)
    }

    p.note(
      [
        `Rules at ${AGENTS_MD_REL_PATH}`,
        `Action plan at ${SETUP_PROMPT_REL_PATH}`,
        `Context at ${CONTEXT_REL_PATH}`,
        '',
        'Cursor / Windsurf / Cline pick up AGENTS.md automatically.',
        `Open your agent and point it at ${SETUP_PROMPT_REL_PATH} to start.`,
      ].join('\n'),
      'Drive your editor agent',
    )

    return state
  },
}
