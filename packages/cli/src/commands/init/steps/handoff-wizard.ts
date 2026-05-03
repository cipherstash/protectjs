import { resolve } from 'node:path'
import * as p from '@clack/prompts'
import { runWizardSpawn } from '../../wizard/index.js'
import {
  CONTEXT_REL_PATH,
  buildContextFile,
  writeContextFile,
} from '../lib/write-context.js'
import type { InitProvider, InitState, InitStep } from '../types.js'

/**
 * Hand off to the CipherStash Agent (the in-house wizard package).
 *
 * Writes `.cipherstash/context.json` so the wizard has the same prepared
 * facts the other handoffs use, then spawns the wizard via `runWizardSpawn`
 * — the same path the top-level `stash wizard` subcommand takes, but with
 * the exit code surfaced rather than `process.exit`-ed so init can finish
 * its own outro and `next-steps` step.
 *
 * No skills are installed here. The wizard fetches its own agent-side
 * prompt from the gateway and runs its own `maybeInstallSkills` flow.
 */
export const handoffWizardStep: InitStep = {
  id: 'handoff-wizard',
  name: 'Use the CipherStash Agent',
  async run(state: InitState, _provider: InitProvider): Promise<InitState> {
    const cwd = process.cwd()
    const envKeys = state.envKeys ?? []

    const contextAbs = resolve(cwd, CONTEXT_REL_PATH)
    const ctx = buildContextFile(state)
    ctx.envKeys = envKeys
    writeContextFile(contextAbs, ctx)
    p.log.success(`Wrote ${CONTEXT_REL_PATH}`)

    // Pass through no extra flags. If a user wants to debug the wizard, they
    // can re-run `stash wizard --debug` directly afterwards.
    const exitCode = await runWizardSpawn([])
    if (exitCode !== 0) {
      p.log.warn(
        `Wizard exited with code ${exitCode}. Re-run \`stash wizard\` to resume.`,
      )
    }

    return state
  },
}
