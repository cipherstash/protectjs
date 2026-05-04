import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as p from '@clack/prompts'
import { buildAgentsMdBody } from '../lib/build-agents-md.js'
import { writeArtifacts } from '../lib/handoff-helpers.js'
import { upsertManagedBlock } from '../lib/sentinel-upsert.js'
import {
  CONTEXT_REL_PATH,
  SETUP_PROMPT_REL_PATH,
} from '../lib/write-context.js'
import type { InitProvider, InitState, InitStep } from '../types.js'

const AGENTS_MD_REL_PATH = 'AGENTS.md'

/**
 * Write `AGENTS.md`, `.cipherstash/context.json`, and
 * `.cipherstash/setup-prompt.md`, then stop.
 *
 * For users running editor-based agents (Cursor, Windsurf, Cline) or any
 * tool that follows the AGENTS.md convention but does NOT auto-load skill
 * directories. We inline the relevant skill content into AGENTS.md so the
 * agent has the API details right there.
 *
 * No `.codex/skills/` or `.claude/skills/` directory is written — those
 * tools wouldn't know to look there. Re-runs replace only the sentinel
 * region in AGENTS.md.
 */
export const handoffAgentsMdStep: InitStep = {
  id: 'handoff-agents-md',
  name: 'Write AGENTS.md',
  async run(state: InitState, _provider: InitProvider): Promise<InitState> {
    const cwd = process.cwd()
    const integration = state.integration ?? 'postgresql'

    const agentsMdAbs = resolve(cwd, AGENTS_MD_REL_PATH)
    const managed = buildAgentsMdBody(integration, 'doctrine-plus-skills')
    const existing = existsSync(agentsMdAbs)
      ? readFileSync(agentsMdAbs, 'utf-8')
      : undefined
    writeFileSync(
      agentsMdAbs,
      upsertManagedBlock({ existing, managed }),
      'utf-8',
    )
    p.log.success(`Wrote ${AGENTS_MD_REL_PATH}`)

    writeArtifacts(cwd, state, 'agents-md', [])

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
