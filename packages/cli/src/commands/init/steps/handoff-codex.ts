import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as p from '@clack/prompts'
import { buildAgentsMdBody } from '../lib/build-agents-md.js'
import { installSkills } from '../lib/install-skills.js'
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
const CODEX_SKILLS_DIR = '.codex/skills'

const CODEX_INSTALL_URL = 'https://github.com/openai/codex'

function spawnCodex(prompt: string): Promise<number> {
  return new Promise((resolvePromise) => {
    const child = spawn('codex', [prompt], {
      stdio: 'inherit',
      shell: false,
    })
    child.on('close', (code) => resolvePromise(code ?? 0))
    child.on('error', () => resolvePromise(-1))
  })
}

/**
 * Hand off to Codex CLI. Following OpenAI's Codex guidance, AGENTS.md
 * holds durable doctrine ("never log plaintext", "encrypted columns are
 * jsonb null", three-phase migration etc.) while the procedural skills
 * live in `.codex/skills/`. Both are written here.
 *
 * AGENTS.md is sentinel-upserted so re-runs replace only our region and
 * any user content outside it survives.
 */
export const handoffCodexStep: InitStep = {
  id: 'handoff-codex',
  name: 'Hand off to Codex',
  async run(state: InitState, _provider: InitProvider): Promise<InitState> {
    const cwd = process.cwd()
    const integration = state.integration ?? 'postgresql'
    const envKeys = state.envKeys ?? []

    const installed = installSkills(cwd, CODEX_SKILLS_DIR, integration)
    if (installed.length > 0) {
      p.log.success(
        `Installed ${installed.length} skill${installed.length !== 1 ? 's' : ''} into ${CODEX_SKILLS_DIR}/: ${installed.join(', ')}`,
      )
    }

    const agentsMdAbs = resolve(cwd, AGENTS_MD_REL_PATH)
    const managed = buildAgentsMdBody(integration, 'doctrine-only')
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
    ctx.installedSkills = installed
    writeContextFile(contextAbs, ctx)
    p.log.success(`Wrote ${CONTEXT_REL_PATH}`)

    const promptCtx = buildSetupPromptContext(state, 'codex', installed)
    if (promptCtx) {
      writeSetupPrompt(resolve(cwd, SETUP_PROMPT_REL_PATH), promptCtx)
      p.log.success(`Wrote ${SETUP_PROMPT_REL_PATH}`)
    }

    const launchPrompt = `Read ${SETUP_PROMPT_REL_PATH} and complete the setup steps. AGENTS.md has the durable rules; the skills under ${CODEX_SKILLS_DIR}/ have the API details; ${CONTEXT_REL_PATH} has the project facts.`

    if (!state.agents?.cli.codex) {
      p.note(
        [
          'Codex is not installed on this machine.',
          `Install: ${CODEX_INSTALL_URL}`,
          '',
          'Once installed, run:',
          `  codex '${launchPrompt}'`,
        ].join('\n'),
        'Files written — install Codex to run the handoff',
      )
      return state
    }

    p.log.info('Launching Codex...')
    const exitCode = await spawnCodex(launchPrompt)
    if (exitCode !== 0) {
      p.log.warn(
        `Codex exited with code ${exitCode}. Re-run \`codex '${launchPrompt}'\` to resume.`,
      )
    }

    return state
  },
}
