import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as p from '@clack/prompts'
import { buildAgentsMdBody } from '../lib/build-agents-md.js'
import { upsertManagedBlock } from '../lib/sentinel-upsert.js'
import {
  CONTEXT_REL_PATH,
  SETUP_PROMPT_REL_PATH,
  buildContextFile,
  buildSetupPromptContext,
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
    const envKeys = state.envKeys ?? []

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

    const contextAbs = resolve(cwd, CONTEXT_REL_PATH)
    const ctx = buildContextFile(state)
    ctx.envKeys = envKeys
    // No skill directory installed for editor-agent users; the rules are
    // inlined directly into AGENTS.md.
    ctx.installedSkills = []
    writeContextFile(contextAbs, ctx)
    p.log.success(`Wrote ${CONTEXT_REL_PATH}`)

    const promptCtx = buildSetupPromptContext(state, 'agents-md', [])
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
