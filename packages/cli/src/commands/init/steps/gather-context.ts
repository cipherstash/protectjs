import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as p from '@clack/prompts'
import { detectAgents } from '../detect-agents.js'
import type { InitProvider, InitState, InitStep } from '../types.js'
import { detectPackageManager } from '../utils.js'

/**
 * Names of env keys observed in the project's `.env*` files. We never read or
 * propagate the values — only the names tell the agent which keys to expect.
 */
function readEnvKeyNames(cwd: string): string[] {
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
 * Pull together everything an external agent will need into in-memory state.
 *
 * No file writes happen here — `handoff-claude` is what serialises this to
 * `.cipherstash/context.json`. We split the responsibilities so the wizard /
 * rules-only branches can also reuse the gathered facts later if we ever
 * surface them.
 */
export const gatherContextStep: InitStep = {
  id: 'gather-context',
  name: 'Gather setup context',
  async run(state: InitState, _provider: InitProvider): Promise<InitState> {
    const cwd = process.cwd()
    const agents = detectAgents(cwd, process.env)
    const envKeys = readEnvKeyNames(cwd)
    const pm = detectPackageManager()

    const detectedBits: string[] = []
    if (state.integration)
      detectedBits.push(`integration: ${state.integration}`)
    detectedBits.push(`package manager: ${pm}`)
    if (agents.cli.claudeCode) detectedBits.push('Claude Code CLI: yes')
    if (envKeys.length > 0) {
      detectedBits.push(`env keys: ${envKeys.length} found`)
    }

    p.log.info(`Detected — ${detectedBits.join(', ')}`)

    return {
      ...state,
      agents,
      // Stash env key names directly on state via a side channel so handoff
      // doesn't have to re-read .env files. Re-using `agents` shape would
      // pollute it, so we use a private getter on the next step instead by
      // reading env keys again — they're cheap. We deliberately don't store
      // values here.
    }
  },
}

/** Re-export so handoff-claude can call it with the same semantics. */
export { readEnvKeyNames }
