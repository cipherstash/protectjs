import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import * as p from '@clack/prompts'
import { installSkills } from '../lib/install-skills.js'
import {
  CONTEXT_REL_PATH,
  SETUP_PROMPT_REL_PATH,
  buildContextFile,
  buildSetupPromptContext,
  writeContextFile,
  writeSetupPrompt,
} from '../lib/write-context.js'
import type { InitProvider, InitState, InitStep } from '../types.js'

const CLAUDE_SKILLS_DIR = '.claude/skills'

const CLAUDE_INSTALL_URL =
  'https://docs.claude.com/en/docs/claude-code/quickstart'

/**
 * Spawn `claude` interactively in the user's terminal so they can watch tool
 * calls and approve edits. We attach stdio to inherit; this step blocks until
 * the user exits Claude Code.
 *
 * Returns the exit code — 0 means the user finished the session normally,
 * non-zero means `claude` crashed or was interrupted. We don't fail init
 * either way: the artifacts are already written, the user can re-run claude.
 */
function spawnClaude(prompt: string): Promise<number> {
  return new Promise((resolvePromise) => {
    const child = spawn('claude', [prompt], {
      stdio: 'inherit',
      shell: false,
    })
    child.on('close', (code) => resolvePromise(code ?? 0))
    child.on('error', () => resolvePromise(-1))
  })
}

/**
 * Hand off to Claude Code: copy the per-integration set of skills into
 * `.claude/skills/`, write `.cipherstash/context.json` and
 * `.cipherstash/setup-prompt.md`, then spawn `claude`. If `claude` is not
 * on PATH we still write the artifacts and print install + manual-launch
 * instructions.
 *
 * The launch prompt points the agent at `setup-prompt.md` first — that's
 * the project-specific action plan. Claude auto-loads the installed skills
 * for the durable rules and API references.
 */
export const handoffClaudeStep: InitStep = {
  id: 'handoff-claude',
  name: 'Hand off to Claude Code',
  async run(state: InitState, _provider: InitProvider): Promise<InitState> {
    const cwd = process.cwd()
    const integration = state.integration ?? 'postgresql'
    const envKeys = state.envKeys ?? []

    const installed = installSkills(cwd, CLAUDE_SKILLS_DIR, integration)
    if (installed.length > 0) {
      p.log.success(
        `Installed ${installed.length} skill${installed.length !== 1 ? 's' : ''} into ${CLAUDE_SKILLS_DIR}/: ${installed.join(', ')}`,
      )
    }

    const contextAbs = resolve(cwd, CONTEXT_REL_PATH)
    const ctx = buildContextFile(state)
    ctx.envKeys = envKeys
    ctx.installedSkills = installed
    writeContextFile(contextAbs, ctx)
    p.log.success(`Wrote ${CONTEXT_REL_PATH}`)

    const promptCtx = buildSetupPromptContext(state, 'claude-code', installed)
    if (promptCtx) {
      writeSetupPrompt(resolve(cwd, SETUP_PROMPT_REL_PATH), promptCtx)
      p.log.success(`Wrote ${SETUP_PROMPT_REL_PATH}`)
    }

    const launchPrompt = `Read ${SETUP_PROMPT_REL_PATH} and complete the setup steps. The installed skills under ${CLAUDE_SKILLS_DIR}/ have the rules; ${CONTEXT_REL_PATH} has the project facts.`

    if (!state.agents?.cli.claudeCode) {
      p.note(
        [
          'Claude Code is not installed on this machine.',
          `Install: ${CLAUDE_INSTALL_URL}`,
          '',
          'Once installed, run:',
          // Single-quote the prompt for the printed example. The launchPrompt
          // is a closed-form string we control, but printing it inside double
          // quotes would break if any path inside ever contained a quote.
          `  claude '${launchPrompt}'`,
        ].join('\n'),
        'Files written — install Claude Code to run the handoff',
      )
      return state
    }

    p.log.info('Launching Claude Code...')
    const exitCode = await spawnClaude(launchPrompt)
    if (exitCode !== 0) {
      p.log.warn(
        `Claude Code exited with code ${exitCode}. Re-run \`claude '${launchPrompt}'\` to resume.`,
      )
    }

    return state
  },
}
