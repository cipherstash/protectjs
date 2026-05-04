import * as p from '@clack/prompts'
import { detectAgents } from '../detect-agents.js'
import type { InitProvider, InitState, InitStep } from '../types.js'
import { detectPackageManager } from '../utils.js'

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
