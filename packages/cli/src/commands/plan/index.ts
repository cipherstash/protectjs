import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import * as p from '@clack/prompts'
import { howToProceedStep } from '../impl/steps/how-to-proceed.js'
import { type AgentEnvironment, detectAgents } from '../init/detect-agents.js'
import { readContextFile } from '../init/lib/read-context.js'
import { PLAN_REL_PATH } from '../init/lib/setup-prompt.js'
import {
  CONTEXT_REL_PATH,
  type ContextFile,
} from '../init/lib/write-context.js'
import {
  CancelledError,
  type InitProvider,
  type InitState,
} from '../init/types.js'
import { detectPackageManager, runnerCommand } from '../init/utils.js'

/**
 * `stash plan` borrows the same handoff machinery as `stash impl`. The
 * handoff steps don't actually use the provider (their `run` signatures
 * take `_provider`); the abstraction is an init-time concept for intro
 * copy. A stub satisfies the type.
 */
const STUB_PROVIDER: InitProvider = {
  name: 'plan',
  introMessage: '',
  getNextSteps: () => [],
}

function buildStateFromContext(
  ctx: ContextFile,
  agents: AgentEnvironment,
): InitState {
  return {
    integration: ctx.integration,
    clientFilePath: ctx.encryptionClientPath,
    schemas: ctx.schemas,
    envKeys: ctx.envKeys,
    stackInstalled: true,
    cliInstalled: true,
    eqlInstalled: true,
    agents,
    mode: 'plan',
  }
}

/**
 * `stash plan` — draft a reviewable encryption plan.
 *
 * Pre-flights `.cipherstash/context.json` (errors with a `stash init`
 * pointer if missing). Always sets `mode='plan'`, dispatches to a handoff
 * target via `howToProceedStep`, and ends with a chain prompt offering to
 * continue into `stash impl`.
 *
 * The deliverable is `.cipherstash/plan.md` with a machine-readable
 * summary block at the top — `stash impl` parses that block to render a
 * confirmation panel before launching implementation.
 */
export async function planCommand() {
  const cwd = process.cwd()
  const pm = detectPackageManager()
  const cli = runnerCommand(pm, 'stash')

  const ctx = readContextFile(cwd)
  if (!ctx) {
    p.log.error(
      `No CipherStash context found at \`${CONTEXT_REL_PATH}\`. Run \`${cli} init\` first.`,
    )
    process.exit(1)
  }

  p.intro('CipherStash Plan')

  try {
    if (existsSync(resolve(cwd, PLAN_REL_PATH))) {
      p.log.warn(
        `Plan already exists at \`${PLAN_REL_PATH}\`. The agent will be told to revise it; delete the file first if you want to start fresh.`,
      )
    }

    const agents = detectAgents(cwd, process.env)
    const state = buildStateFromContext(ctx, agents)

    await howToProceedStep.run(state, STUB_PROVIDER)

    // Chain into `stash impl` so the user doesn't have to copy/paste. Lazy
    // import avoids a circular module load — plan and impl both pull from
    // init/lib/ and need to be importable independently.
    if (process.stdout.isTTY) {
      const proceed = await p.confirm({
        message: `Plan drafted at \`${PLAN_REL_PATH}\`. Continue to \`${cli} impl\` now?`,
        initialValue: true,
      })
      if (!p.isCancel(proceed) && proceed) {
        p.outro('Plan complete — handing off to `stash impl`.')
        const { implCommand } = await import('../impl/index.js')
        await implCommand({})
        return
      }
    }

    p.outro(
      `Plan drafted at \`${PLAN_REL_PATH}\`. Review it, then run \`${cli} impl\` to implement.`,
    )
  } catch (err) {
    if (err instanceof CancelledError) {
      p.cancel('Cancelled.')
      process.exit(0)
    }
    throw err
  }
}
