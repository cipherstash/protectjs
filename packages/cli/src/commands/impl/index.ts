import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as p from '@clack/prompts'
import { type AgentEnvironment, detectAgents } from '../init/detect-agents.js'
import { parsePlanSummary, renderPlanSummary } from '../init/lib/parse-plan.js'
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
import { howToProceedStep } from './steps/how-to-proceed.js'

/**
 * The handoff steps in `impl/steps/handoff-*.ts` accept an `InitProvider`
 * but ignore it. Stub keeps the type signature happy without pretending
 * impl has provider-specific behaviour.
 */
const STUB_PROVIDER: InitProvider = {
  name: 'impl',
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
    mode: 'implement',
  }
}

/**
 * Confirm "are you sure?" before implementing without a plan. The
 * default-no on the confirm is the security stance — passing through
 * the planning checkpoint by accident is the failure mode we're guarding
 * against.
 */
async function confirmContinueWithoutPlan(): Promise<void> {
  const confirmed = await p.confirm({
    message:
      'Implementing without a plan commits you to ~45–60 min of agent work. Continue?',
    initialValue: false,
  })
  if (p.isCancel(confirmed) || !confirmed) {
    throw new CancelledError()
  }
}

/**
 * `stash impl` — execute an encryption plan.
 *
 * Always runs in implement mode. Behaviour branches on disk state and
 * flags:
 *
 *   - **Plan exists** (TTY): parse the structured summary block, render
 *     a confirmation panel, ask the user to proceed. Default-yes.
 *   - **Plan exists** (non-TTY): proceed without confirmation.
 *   - **No plan, `--continue-without-plan`**: confirm once, then implement.
 *   - **No plan, TTY**: present a `p.select` — draft a plan first
 *     (delegates to `planCommand`) or continue without one (confirms
 *     once, then implements).
 *   - **No plan, non-TTY**: error out with a clear next-action; CI must
 *     pass `--continue-without-plan` or run `stash plan` first.
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

  const planPath = resolve(cwd, PLAN_REL_PATH)
  const planExists = existsSync(planPath)
  const continueWithoutPlan = flags['continue-without-plan'] === true
  const isTTY = process.stdout.isTTY

  try {
    if (planExists) {
      // Plan-summary checkpoint: the last save point before launching the
      // (potentially hour-long) implementation phase.
      if (isTTY) {
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
      } else {
        p.log.info(
          `Plan at \`${PLAN_REL_PATH}\` — agent will execute it as the source of truth.`,
        )
      }
    } else {
      // No plan on disk. Branch on flag / TTY / interactive.
      if (continueWithoutPlan) {
        await confirmContinueWithoutPlan()
      } else if (!isTTY) {
        p.log.error(
          `No plan at \`${PLAN_REL_PATH}\`. Run \`${cli} plan\` first, or pass --continue-without-plan to skip planning.`,
        )
        process.exit(1)
      } else {
        const choice = await p.select<'plan' | 'continue'>({
          message: 'No plan found. What would you like to do?',
          options: [
            {
              value: 'plan',
              label: 'Draft a plan first (recommended)',
              hint: `runs \`${cli} plan\` — usually 1–3 min`,
            },
            {
              value: 'continue',
              label: 'Continue without a plan',
              hint: 'skip the planning checkpoint',
            },
          ],
          initialValue: 'plan',
        })
        if (p.isCancel(choice)) throw new CancelledError()

        if (choice === 'plan') {
          // Lazy import avoids a circular module load between plan ↔ impl.
          const { planCommand } = await import('../plan/index.js')
          // Close the current intro frame before plan opens its own.
          p.outro('Handing off to `stash plan`.')
          await planCommand()
          return
        }

        await confirmContinueWithoutPlan()
      }
    }

    const agents = detectAgents(cwd, process.env)
    const state = buildStateFromContext(ctx, agents)

    await howToProceedStep.run(state, STUB_PROVIDER)

    p.outro(
      `Implementation handoff complete. Run \`${cli} db status\` to verify state.`,
    )
  } catch (err) {
    if (err instanceof CancelledError) {
      p.cancel('Cancelled.')
      process.exit(0)
    }
    throw err
  }
}
