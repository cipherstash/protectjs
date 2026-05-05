import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as p from '@clack/prompts'
import { PLAN_REL_PATH } from '../init/lib/setup-prompt.js'
import {
  CONTEXT_REL_PATH,
  type ContextFile,
  SETUP_PROMPT_REL_PATH,
} from '../init/lib/write-context.js'
import { detectPackageManager, runnerCommand } from '../init/utils.js'

export type StageStatus = 'done' | 'pending'

export interface Stage {
  label: string
  status: StageStatus
  detail: string
}

export interface ProjectStatus {
  initialized: boolean
  context?: ContextFile
  planExists: boolean
  /** Setup-prompt is written by every `stash impl` run, regardless of mode.
   *  Its presence means the user has handed off to an agent at least once;
   *  it does NOT mean implementation is complete. We surface it as a softer
   *  "agent has been engaged" signal rather than treating it as done. */
  agentEngaged: boolean
}

export function readProjectStatus(cwd: string): ProjectStatus {
  const contextPath = resolve(cwd, CONTEXT_REL_PATH)
  let context: ContextFile | undefined
  if (existsSync(contextPath)) {
    try {
      context = JSON.parse(readFileSync(contextPath, 'utf-8')) as ContextFile
    } catch {
      // malformed context.json — treat as not-initialized
    }
  }
  return {
    initialized: context !== undefined,
    context,
    planExists: existsSync(resolve(cwd, PLAN_REL_PATH)),
    agentEngaged: existsSync(resolve(cwd, SETUP_PROMPT_REL_PATH)),
  }
}

export function buildStages(status: ProjectStatus, cli: string): Stage[] {
  const initDetail = status.context
    ? `${status.context.integration} · ${status.context.packageManager} · ${status.context.schemas.length} table${status.context.schemas.length === 1 ? '' : 's'}`
    : `run \`${cli} init\` to begin`

  const planDetail = status.planExists
    ? PLAN_REL_PATH
    : status.initialized
      ? `run \`${cli} impl\` to draft`
      : 'waiting on init'

  let implLabel = 'Implementation'
  let implDetail: string
  const implStatus: StageStatus = 'pending'
  if (!status.initialized) {
    implDetail = 'waiting on init'
  } else if (!status.planExists) {
    implDetail = 'waiting on plan'
  } else if (!status.agentEngaged) {
    implDetail = `run \`${cli} impl\` to execute the plan`
  } else {
    // Agent has been engaged at least once. We can't tell from disk alone
    // whether the implementation is complete — that requires DB inspection
    // (`stash encrypt status`). Keep status as `pending` and point there.
    implLabel = 'Implementation'
    implDetail = `agent engaged — see \`${cli} encrypt status\` for column-level state`
  }

  return [
    {
      label: 'Initialized',
      status: status.initialized ? 'done' : 'pending',
      detail: initDetail,
    },
    {
      label: 'Plan written',
      status: status.planExists ? 'done' : 'pending',
      detail: planDetail,
    },
    {
      label: implLabel,
      status: implStatus,
      detail: implDetail,
    },
  ]
}

export function nextAction(status: ProjectStatus, cli: string): string {
  if (!status.initialized) return `Run \`${cli} init\` to begin.`
  if (!status.planExists) {
    return `Run \`${cli} impl\` to draft your encryption plan.`
  }
  if (!status.agentEngaged) {
    return `Review \`${PLAN_REL_PATH}\`, then run \`${cli} impl\` to implement.`
  }
  return `Run \`${cli} encrypt status\` to inspect per-column migration state.`
}

const LABEL_WIDTH = 16

function renderStage(stage: Stage): string {
  const marker = stage.status === 'done' ? '✓' : '◯'
  return `${marker} ${stage.label.padEnd(LABEL_WIDTH)} ${stage.detail}`
}

/**
 * `stash status` — the lifecycle map. Reads disk state only:
 * `.cipherstash/context.json` (init done?), `.cipherstash/plan.md` (plan
 * written?), `.cipherstash/setup-prompt.md` (agent engaged at least once?).
 * Points at `stash db status` and `stash encrypt status` for the deeper
 * state that requires database connectivity.
 *
 * Designed to give the user a one-shot answer to "where am I?" without
 * waiting on auth, DB connection, or any network round-trip. Runs in
 * milliseconds. The deeper commands stay specialised.
 */
export async function statusCommand() {
  const cwd = process.cwd()
  const pm = detectPackageManager()
  const cli = runnerCommand(pm, 'stash')

  const status = readProjectStatus(cwd)
  const stages = buildStages(status, cli)

  p.intro('CipherStash project status')

  p.note(stages.map(renderStage).join('\n'), 'Lifecycle')

  const deeper = [
    `Database state:   \`${cli} db status\``,
    `Per-column state: \`${cli} encrypt status\``,
  ].join('\n')
  p.note(deeper, 'Deeper inspection')

  p.outro(nextAction(status, cli))
}
