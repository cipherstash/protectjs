import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as p from '@clack/prompts'
import { detectAgents } from '../detect-agents.js'
import type { InitProvider, InitState, InitStep } from '../types.js'
import { detectPackageManager } from '../utils.js'

/**
 * Names of env keys observed in the project's `.env*` files. We never read or
 * propagate the values — only the names tell the agent which keys to expect.
 *
 * Exported so build-schema can populate `state.envKeys` once at the start of
 * the run; the handoff steps then read from state. Keeping the function here
 * (rather than under `lib/`) groups it with the other context-gathering
 * helpers.
 */
export function readEnvKeyNames(cwd: string): string[] {
  const candidates = [
    '.env',
    '.env.local',
    '.env.development',
    '.env.development.local',
  ]
  const seen = new Set<string>()
  for (const file of candidates) {
    const path = resolve(cwd, file)
    if (!existsSync(path)) continue
    let text: string
    try {
      text = readFileSync(path, 'utf-8')
    } catch {
      continue
    }
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq <= 0) continue
      const key = trimmed.slice(0, eq).trim()
      if (key) seen.add(key)
    }
  }
  return Array.from(seen).sort()
}

/**
 * Detect available coding agents and log a one-line summary of the state
 * the user just set up.
 *
 * Env keys are already on `state.envKeys` (populated by build-schema); we
 * only read them off state here to mention the count. No file writes.
 */
export const gatherContextStep: InitStep = {
  id: 'gather-context',
  name: 'Gather setup context',
  async run(state: InitState, _provider: InitProvider): Promise<InitState> {
    const cwd = process.cwd()
    const agents = detectAgents(cwd, process.env)
    const pm = detectPackageManager()
    const envKeyCount = state.envKeys?.length ?? 0

    const detectedBits: string[] = []
    if (state.integration)
      detectedBits.push(`integration: ${state.integration}`)
    detectedBits.push(`package manager: ${pm}`)
    if (agents.cli.claudeCode) detectedBits.push('Claude Code CLI: yes')
    if (agents.cli.codex) detectedBits.push('Codex CLI: yes')
    if (envKeyCount > 0) {
      detectedBits.push(`env keys: ${envKeyCount} found`)
    }

    p.log.info(`Detected — ${detectedBits.join(', ')}`)

    return { ...state, agents }
  },
}
