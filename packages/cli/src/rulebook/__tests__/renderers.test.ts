import { describe, expect, it } from 'vitest'
import {
  CLAUDE_SKILL_NAME,
  RULEBOOK_VERSION,
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
