import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import * as p from '@clack/prompts'
import { fetchRulebook } from '../lib/fetch-rulebook.js'
import {
  CONTEXT_REL_PATH,
  buildContextFile,
  readCliVersion,
  writeArtifact,
  writeContextFile,
} from '../lib/write-context.js'
import type { InitProvider, InitState, InitStep } from '../types.js'
import { readEnvKeyNames } from './gather-context.js'

const AGENTS_MD_REL_PATH = 'AGENTS.md'

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
 * Hand off to Codex CLI: write AGENTS.md (sentinel-upserted) + context.json,
 * spawn `codex`. If `codex` is not on PATH we still write the artifacts and
 * print install + manual-launch instructions.
 */
export const handoffCodexStep: InitStep = {
  id: 'handoff-codex',
  name: 'Hand off to Codex',
  async run(state: InitState, _provider: InitProvider): Promise<InitState> {
    const cwd = process.cwd()
    const integration = state.integration ?? 'postgresql'
    const cliVersion = readCliVersion()
    const envKeys = readEnvKeyNames(cwd)

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

    const launchPrompt = `Read AGENTS.md and complete the CipherStash setup. Context is in ${CONTEXT_REL_PATH}.`

    if (!state.agents?.cli.codex) {
      p.note(
        [
          'Codex is not installed on this machine.',
          `Install: ${CODEX_INSTALL_URL}`,
          '',
          'Once installed, run:',
          `  codex "${launchPrompt}"`,
        ].join('\n'),
        'Files written — install Codex to run the handoff',
      )
      return state
    }

    p.log.info('Launching Codex...')
    const exitCode = await spawnCodex(launchPrompt)
    if (exitCode !== 0) {
      p.log.warn(
        `Codex exited with code ${exitCode}. Re-run \`codex "${launchPrompt}"\` to resume.`,
      )
    }

    return state
  },
}
