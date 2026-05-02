import { resolve } from 'node:path'
import * as p from '@clack/prompts'
import { RULEBOOK_VERSION } from '../../../rulebook/index.js'
import { wizardCommand } from '../../wizard/index.js'
import {
  CONTEXT_REL_PATH,
  buildContextFile,
  writeContextFile,
} from '../lib/write-context.js'
import type { InitProvider, InitState, InitStep } from '../types.js'
import { readEnvKeyNames } from './gather-context.js'

/**
 * Hand off to the CipherStash Agent (the in-house wizard package).
 *
 * Writes `.cipherstash/context.json` so the wizard has the same prepared
 * facts the other handoffs use, then invokes `wizardCommand` — the same
 * thin-wrapper subcommand a user would get from `stash wizard` directly.
 *
 * No SKILL.md / AGENTS.md is written here. The wizard renders its own
 * agent-side prompt from the gateway and doesn't read disk-bound rulebooks.
 */
export const handoffWizardStep: InitStep = {
  id: 'handoff-wizard',
  name: 'Use the CipherStash Agent',
  async run(state: InitState, _provider: InitProvider): Promise<InitState> {
    const cwd = process.cwd()
    const envKeys = readEnvKeyNames(cwd)

    const contextAbs = resolve(cwd, CONTEXT_REL_PATH)
    const ctx = buildContextFile(state, RULEBOOK_VERSION)
    ctx.envKeys = envKeys
    writeContextFile(contextAbs, ctx)
    p.log.success(`Wrote ${CONTEXT_REL_PATH}`)

    // Pass through no extra flags. If a user wants to debug the wizard, they
    // can re-run `stash wizard --debug` directly afterwards.
    await wizardCommand([])

    return state
  },
}
