import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import * as p from '@clack/prompts'
import { CLAUDE_SKILL_NAME } from '../../../rulebook/index.js'
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
import { readEnvKeyNames } from './gather-context.js'

const SKILL_REL_PATH = `.claude/skills/${CLAUDE_SKILL_NAME}/SKILL.md`

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
 * Hand off to Claude Code: install the project skill, write context.json
 * and setup-prompt.md, spawn `claude`. If `claude` is not on PATH we still
 * write the artifacts and print install + manual-launch instructions.
 *
 * The launch prompt points the agent at `setup-prompt.md` first — that's the
 * project-specific action plan. The skill body is the reusable rulebook and
 * is referenced from the prompt.
 */
export const handoffClaudeStep: InitStep = {
  id: 'handoff-claude',
  name: 'Hand off to Claude Code',
  async run(state: InitState, _provider: InitProvider): Promise<InitState> {
    const cwd = process.cwd()
    const integration = state.integration ?? 'postgresql'
    const cliVersion = readCliVersion()
    const envKeys = readEnvKeyNames(cwd)

    const rulebookSpinner = p.spinner()
    rulebookSpinner.start('Fetching rulebook...')
    const rulebook = await fetchRulebook({
      integration,
      agent: 'claude-code',
      clientVersion: cliVersion,
    })
    rulebookSpinner.stop(
      rulebook.source === 'gateway'
        ? `Rulebook ${rulebook.rulebookVersion} fetched.`
        : `Rulebook ${rulebook.rulebookVersion} (bundled — gateway unavailable).`,
    )

    const skillAbs = resolve(cwd, SKILL_REL_PATH)
    writeArtifact(skillAbs, rulebook.body)
    p.log.success(`Wrote ${SKILL_REL_PATH}`)

    const contextAbs = resolve(cwd, CONTEXT_REL_PATH)
    const ctx = buildContextFile(state, rulebook.rulebookVersion)
    ctx.envKeys = envKeys
    writeContextFile(contextAbs, ctx)
    p.log.success(`Wrote ${CONTEXT_REL_PATH}`)

    const promptCtx = buildSetupPromptContext(state, 'claude-code')
    if (promptCtx) {
      writeSetupPrompt(resolve(cwd, SETUP_PROMPT_REL_PATH), promptCtx)
      p.log.success(`Wrote ${SETUP_PROMPT_REL_PATH}`)
    }

    const launchPrompt = `Read ${SETUP_PROMPT_REL_PATH} and complete the setup steps. The ${CLAUDE_SKILL_NAME} skill has the rules; ${CONTEXT_REL_PATH} has the project facts.`

    if (!state.agents?.cli.claudeCode) {
      p.note(
        [
          'Claude Code is not installed on this machine.',
          `Install: ${CLAUDE_INSTALL_URL}`,
          '',
          'Once installed, run:',
          `  claude "${launchPrompt}"`,
        ].join('\n'),
        'Files written — install Claude Code to run the handoff',
      )
      return state
    }

    p.log.info('Launching Claude Code...')
    const exitCode = await spawnClaude(launchPrompt)
    if (exitCode !== 0) {
      p.log.warn(
        `Claude Code exited with code ${exitCode}. Re-run \`claude "${launchPrompt}"\` to resume.`,
      )
    }

    return state
  },
}
