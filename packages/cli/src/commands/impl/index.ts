import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as p from '@clack/prompts'
import { type AgentEnvironment, detectAgents } from '../init/detect-agents.js'
import { parsePlanSummary, renderPlanSummary } from '../init/lib/parse-plan.js'
import { PLAN_REL_PATH } from '../init/lib/setup-prompt.js'
import {
  CONTEXT_REL_PATH,
  type ContextFile,
} from '../init/lib/write-context.js'
import {
  CancelledError,
  type InitMode,
  type InitProvider,
  type InitState,
} from '../init/types.js'
import { detectPackageManager, runnerCommand } from '../init/utils.js'
import { howToProceedStep } from './steps/how-to-proceed.js'

/**
 * The handoff steps in `impl/steps/handoff-*.ts` accept an `InitProvider`
 * but ignore it (their `run` signatures take `_provider`). The provider
 * abstraction belongs to the `init` flow, where it picks intro copy and
 * default next-steps. `stash impl` reads everything it needs from
 * `.cipherstash/context.json` instead, so a stub keeps the type signature
 * happy without pretending impl has provider-specific behaviour.
 */
const STUB_PROVIDER: InitProvider = {
  name: 'impl',
  introMessage: '',
  getNextSteps: () => [],
}

export function readContextFile(cwd: string): ContextFile | undefined {
  const path = resolve(cwd, CONTEXT_REL_PATH)
  if (!existsSync(path)) return undefined
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as ContextFile
  } catch {
    return undefined
  }
}

/**
 * Derive the impl mode from disk state and flags.
 *
 *   no `--yolo`, plan missing  → `plan` (default — the safer path)
 *   no `--yolo`, plan exists   → `implement` (the plan is the source of truth)
 *   `--yolo`, plan missing     → `implement` after interactive confirmation
 *   `--yolo`, plan exists      → `implement`; `--yolo` is a no-op once a plan
 *                                exists, since the safety checkpoint already
 *                                fired
 *
 * The interactive confirmation when `--yolo` is the only thing standing
 * between the user and ~45–60 min of agent-driven implementation. Cheap
 * to ask, expensive to skip by accident.
 */
export async function deriveMode(
  cwd: string,
  yolo: boolean,
): Promise<InitMode> {
  const planExists = existsSync(resolve(cwd, PLAN_REL_PATH))

  if (yolo) {
    if (planExists) {
      p.log.info(
        `Plan exists at \`${PLAN_REL_PATH}\` — \`--yolo\` is a no-op when a plan is already in place.`,
      )
      return 'implement'
    }
    const confirmed = await p.confirm({
      message:
        'Skip the planning checkpoint and go straight to implementation?',
      initialValue: false,
    })
    if (p.isCancel(confirmed) || !confirmed) {
      throw new CancelledError()
    }
    return 'implement'
  }

  return planExists ? 'implement' : 'plan'
}

function buildStateFromContext(
  ctx: ContextFile,
  mode: InitMode,
  agents: AgentEnvironment,
): InitState {
  return {
    integration: ctx.integration,
    clientFilePath: ctx.encryptionClientPath,
    schemas: ctx.schemas,
    envKeys: ctx.envKeys,
    // After init has run, these are true. The pre-flight context.json
    // check above is the gate — if init didn't complete, context.json
    // wouldn't exist and we'd have already errored.
    stackInstalled: true,
    cliInstalled: true,
    eqlInstalled: true,
    agents,
    mode,
  }
}

/**
 * `stash impl` — the agent handoff phase.
 *
 * Pre-flights `.cipherstash/context.json` (errors with a `stash init`
 * pointer if missing). Derives plan-vs-implement mode from disk state and
 * the `--yolo` flag, then dispatches to a handoff target via
 * `howToProceedStep`. Modes:
 *
 *   - `plan` (default when no `.cipherstash/plan.md` exists): the agent
 *     produces a reviewable plan file. The user reads it, then re-runs
 *     `stash impl` to execute.
 *   - `implement` (default when a plan exists): the agent executes the
 *     plan as the source of truth.
 *   - `--yolo` forces `implement` even with no plan, after an interactive
 *     confirmation prompt.
 */
export async function implCommand(flags: Record<string, boolean>) {
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

  p.intro('CipherStash Implementation')

  try {
    const mode = await deriveMode(cwd, flags.yolo === true)

    const planPath = resolve(cwd, PLAN_REL_PATH)
    const planExists = existsSync(planPath)

    if (mode === 'plan') {
      p.log.info(
        `No plan at \`${PLAN_REL_PATH}\`. The agent will draft one for you to review.`,
      )
    } else if (planExists && process.stdout.isTTY) {
      // Plan-summary checkpoint: the last save point before the agent
      // commits to the (potentially hour-long) implementation phase. Parse
      // the structured summary block the planning agent was instructed to
      // emit; fall back to a soft "open it in your editor" panel if the
      // block is missing (older plans, or an agent that didn't follow the
      // schema). Default-yes on the confirm — the user is here to proceed.
      const summary = parsePlanSummary(readFileSync(planPath, 'utf-8'))
      if (summary) {
        p.note(renderPlanSummary(summary), 'Plan summary')
      } else {
        p.note(
          `Plan at \`${PLAN_REL_PATH}\` doesn't include a machine-readable summary. Open it in your editor before proceeding.`,
          'Plan ready',
        )
      }
      const proceed = await p.confirm({
        message: 'Proceed with implementation against this plan?',
        initialValue: true,
      })
      if (p.isCancel(proceed) || !proceed) {
        throw new CancelledError()
      }
    } else if (planExists) {
      // Non-TTY: skip the confirm; assume the caller (CI, pipe) wants to proceed.
      p.log.info(
        `Plan at \`${PLAN_REL_PATH}\` — agent will execute it as the source of truth.`,
      )
    } else {
      // Implement without a plan — `--yolo` already confirmed earlier in deriveMode.
      p.log.info('No plan exists — implementing from scratch (--yolo).')
    }

    const agents = detectAgents(cwd, process.env)
    const state = buildStateFromContext(ctx, mode, agents)

    await howToProceedStep.run(state, STUB_PROVIDER)

    if (mode === 'plan') {
      p.outro(
        `Plan drafted at \`${PLAN_REL_PATH}\`. Review it, then run \`${cli} impl\` again to implement.`,
      )
    } else {
      p.outro(
        `Implementation handoff complete. Run \`${cli} db status\` to verify state.`,
      )
    }
  } catch (err) {
    if (err instanceof CancelledError) {
      p.cancel('Cancelled.')
      process.exit(0)
    }
    throw err
  }
}
