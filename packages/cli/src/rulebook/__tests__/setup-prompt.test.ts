import { describe, expect, it } from 'vitest'
import {
  RULEBOOK_VERSION,
  type SetupPromptContext,
  renderSetupPrompt,
} from '../index.js'

const baseCtx: SetupPromptContext = {
  integration: 'drizzle',
  encryptionClientPath: './src/encryption/index.ts',
  packageManager: 'pnpm',
  schema: {
    tableName: 'users',
    columns: [{ name: 'email', dataType: 'string', searchOps: ['equality'] }],
  },
  schemaFromIntrospection: false,
  eqlInstalled: false,
  stackInstalled: false,
  cliInstalled: false,
  handoff: 'claude-code',
}

describe('renderSetupPrompt', () => {
  it('emits the rulebook version + integration in the header', () => {
    const out = renderSetupPrompt(baseCtx)
    expect(out).toContain(`Rulebook version: ${RULEBOOK_VERSION}`)
    expect(out).toContain('Integration: drizzle')
    expect(out).toContain('Package manager: pnpm')
  })

  it('marks placeholder schema as a TODO when not from introspection', () => {
    const out = renderSetupPrompt(baseCtx)
    expect(out).toMatch(/PLACEHOLDER schema/)
    expect(out).toMatch(/Reshape the encryption client/)
  })

  it('drops the reshape TODO when schema came from introspection', () => {
    const out = renderSetupPrompt({
      ...baseCtx,
      schemaFromIntrospection: true,
    })
    expect(out).toMatch(/sourced from live database introspection/)
    expect(out).not.toMatch(/Reshape the encryption client/)
  })

  it('lists EQL install as a TODO when not installed', () => {
    const out = renderSetupPrompt(baseCtx)
    expect(out).toMatch(/Install EQL into the database/)
  })

  it('drops the EQL install TODO when already installed', () => {
    const out = renderSetupPrompt({ ...baseCtx, eqlInstalled: true })
    expect(out).toMatch(/Installed the EQL extension/)
    expect(out).not.toMatch(/Install EQL into the database/)
  })

  it('emits drizzle-kit commands for drizzle integration', () => {
    const out = renderSetupPrompt(baseCtx)
    expect(out).toContain('pnpm exec drizzle-kit generate')
    expect(out).toContain('pnpm exec drizzle-kit migrate')
  })

  it('emits supabase migration commands for supabase integration', () => {
    const out = renderSetupPrompt({
      ...baseCtx,
      integration: 'supabase',
    })
    expect(out).toContain('supabase migration new')
    expect(out).toContain('encryptedSupabase')
  })

  it('uses the right runner per package manager', () => {
    const npm = renderSetupPrompt({ ...baseCtx, packageManager: 'npm' })
    const bun = renderSetupPrompt({ ...baseCtx, packageManager: 'bun' })
    const yarn = renderSetupPrompt({ ...baseCtx, packageManager: 'yarn' })

    expect(npm).toContain('npx --no-install drizzle-kit generate')
    expect(bun).toContain('bun x drizzle-kit generate')
    expect(yarn).toContain('yarn drizzle-kit generate')
  })

  it('points claude-code handoffs at the skill, others at AGENTS.md', () => {
    const claude = renderSetupPrompt({ ...baseCtx, handoff: 'claude-code' })
    const codex = renderSetupPrompt({ ...baseCtx, handoff: 'codex' })
    const agents = renderSetupPrompt({ ...baseCtx, handoff: 'agents-md' })

    expect(claude).toContain('cipherstash-setup` skill')
    expect(codex).toContain('AGENTS.md')
    expect(agents).toContain('AGENTS.md')
  })
})
