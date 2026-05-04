import { describe, expect, it } from 'vitest'
import { buildAgentsMdBody } from '../build-agents-md.js'

const SENTINEL_START = '<!-- cipherstash:rulebook start -->'
const SENTINEL_END = '<!-- cipherstash:rulebook end -->'

describe('buildAgentsMdBody', () => {
  it('wraps the body in the rulebook sentinel pair', () => {
    const out = buildAgentsMdBody('drizzle', 'doctrine-only')
    expect(out.startsWith(SENTINEL_START)).toBe(true)
    expect(out.trimEnd().endsWith(SENTINEL_END)).toBe(true)
  })

  it('doctrine-only includes the durable doctrine but no skill content', () => {
    const out = buildAgentsMdBody('drizzle', 'doctrine-only')
    expect(out).toContain('# CipherStash')
    // Doctrine references invariants — pick a stable phrase that's unlikely
    // to drift across rewrites.
    expect(out).toMatch(/Never log plaintext/)
    // Inlined skill markers should NOT appear.
    expect(out).not.toContain('# Skill: stash-encryption')
    expect(out).not.toContain('# Skill: stash-drizzle')
  })

  it('doctrine-plus-skills inlines the per-integration skills', () => {
    const out = buildAgentsMdBody('drizzle', 'doctrine-plus-skills')
    expect(out).toContain('# CipherStash')
    expect(out).toContain('# Skill: stash-encryption')
    expect(out).toContain('# Skill: stash-drizzle')
    expect(out).toContain('# Skill: stash-cli')
    // Frontmatter from individual skill files should be stripped — the
    // `name: <skill>` line is part of YAML frontmatter and should not leak.
    expect(out).not.toMatch(/^---\nname: stash-encryption/m)
  })

  it('inlines a different skill set per integration', () => {
    const drizzleOut = buildAgentsMdBody('drizzle', 'doctrine-plus-skills')
    const supabaseOut = buildAgentsMdBody('supabase', 'doctrine-plus-skills')

    expect(drizzleOut).toContain('# Skill: stash-drizzle')
    expect(drizzleOut).not.toContain('# Skill: stash-supabase')

    expect(supabaseOut).toContain('# Skill: stash-supabase')
    expect(supabaseOut).not.toContain('# Skill: stash-drizzle')
  })

  it('postgresql integration omits ORM-specific skills', () => {
    const out = buildAgentsMdBody('postgresql', 'doctrine-plus-skills')
    expect(out).toContain('# Skill: stash-encryption')
    expect(out).toContain('# Skill: stash-cli')
    expect(out).not.toContain('# Skill: stash-drizzle')
    expect(out).not.toContain('# Skill: stash-supabase')
  })
})
