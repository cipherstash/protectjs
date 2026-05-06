import { describe, expect, it } from 'vitest'
import type { AgentEnvironment } from '../../init/detect-agents.js'
import type { InitState } from '../../init/types.js'
import { buildOptions, defaultChoice } from '../steps/how-to-proceed.js'

function makeAgents(claudeCode: boolean, codex: boolean): AgentEnvironment {
  return {
    cli: { claudeCode, codex },
    project: {
      claudeDir: false,
      claudeMd: false,
      claudeSkillsDir: false,
      agentsMd: false,
    },
    editor: 'unknown',
  }
}

const noAgents: InitState = { agents: makeAgents(false, false) }
const claudeOnly: InitState = { agents: makeAgents(true, false) }
const codexOnly: InitState = { agents: makeAgents(false, true) }

describe('howToProceed — buildOptions', () => {
  it('offers all four targets in implement mode', () => {
    const opts = buildOptions(noAgents, 'implement')
    const values = opts.map((o) => o.value)
    expect(values).toEqual(['claude-code', 'codex', 'wizard', 'agents-md'])
  })

  it('offers only claude-code and codex in plan mode', () => {
    const opts = buildOptions(noAgents, 'plan')
    const values = opts.map((o) => o.value)
    expect(values).toEqual(['claude-code', 'codex'])
  })

  it('reflects detection state in hints regardless of mode', () => {
    const implement = buildOptions(claudeOnly, 'implement')
    const plan = buildOptions(claudeOnly, 'plan')

    const implementClaude = implement.find((o) => o.value === 'claude-code')
    const planClaude = plan.find((o) => o.value === 'claude-code')

    expect(implementClaude?.hint).toMatch(/detected/)
    expect(planClaude?.hint).toMatch(/detected/)
  })
})

describe('howToProceed — defaultChoice', () => {
  it('prefers claude-code when detected', () => {
    expect(defaultChoice(claudeOnly, 'implement')).toBe('claude-code')
    expect(defaultChoice(claudeOnly, 'plan')).toBe('claude-code')
  })

  it('prefers codex when claude is absent and codex is detected', () => {
    expect(defaultChoice(codexOnly, 'implement')).toBe('codex')
    expect(defaultChoice(codexOnly, 'plan')).toBe('codex')
  })

  it('falls back to agents-md in implement mode when no CLI is detected', () => {
    expect(defaultChoice(noAgents, 'implement')).toBe('agents-md')
  })

  it('falls back to claude-code in plan mode when no CLI is detected', () => {
    // Plan mode never offers agents-md; claude-code is the listed default
    // so the picker has a valid initialValue rather than falling through
    // to a hidden option.
    expect(defaultChoice(noAgents, 'plan')).toBe('claude-code')
  })
})
