import { describe, expect, it } from 'vitest'
import {
  CLAUDE_SKILL_NAME,
  RULEBOOK_VERSION,
  renderAgentsMd,
  renderClaudeSkill,
  renderGatewayPrompt,
} from '../index.js'

describe('renderGatewayPrompt', () => {
  it('includes the rulebook version, integration name, and core rules', () => {
    const out = renderGatewayPrompt({ integration: 'drizzle' })
    expect(out).toContain(RULEBOOK_VERSION)
    expect(out).toContain('Integration: drizzle')
    expect(out).toContain('.cipherstash/context.json')
  })

  it('switches body per integration', () => {
    const drizzle = renderGatewayPrompt({ integration: 'drizzle' })
    const supabase = renderGatewayPrompt({ integration: 'supabase' })
    expect(drizzle).toContain('drizzle-orm')
    expect(supabase).toContain('encryptedSupabase')
    expect(drizzle).not.toContain('encryptedSupabase')
  })
})

describe('renderClaudeSkill', () => {
  it('emits valid YAML frontmatter naming the skill', () => {
    const out = renderClaudeSkill({ integration: 'drizzle' })
    const lines = out.split('\n')
    expect(lines[0]).toBe('---')
    expect(out).toMatch(new RegExp(`name: ${CLAUDE_SKILL_NAME}`))
    expect(out).toMatch(/integration: drizzle/)
    expect(out).toMatch(/rulebook_version:/)
  })

  it('mentions context.json as the first action', () => {
    const out = renderClaudeSkill({ integration: 'supabase' })
    expect(out).toContain('.cipherstash/context.json')
  })
})

describe('renderAgentsMd', () => {
  it('emits plain markdown without YAML frontmatter', () => {
    const out = renderAgentsMd({ integration: 'drizzle' })
    expect(out.startsWith('---')).toBe(false)
    expect(out.startsWith('# CipherStash Setup')).toBe(true)
  })

  it('includes the rulebook version and integration in the header', () => {
    const out = renderAgentsMd({ integration: 'drizzle' })
    expect(out).toContain(`Rulebook version: ${RULEBOOK_VERSION}`)
    expect(out).toContain('integration: drizzle')
  })

  it('points the agent at .cipherstash/context.json', () => {
    const out = renderAgentsMd({ integration: 'supabase' })
    expect(out).toContain('.cipherstash/context.json')
    expect(out).toContain('First step')
  })
})
