import { describe, expect, it } from 'vitest'
import { type SetupPromptContext, renderSetupPrompt } from '../setup-prompt.js'

const baseCtx: SetupPromptContext = {
  integration: 'drizzle',
  encryptionClientPath: './src/encryption/index.ts',
  packageManager: 'pnpm',
  schemaFromIntrospection: false,
  eqlInstalled: true,
  stackInstalled: true,
  cliInstalled: true,
  handoff: 'claude-code',
  installedSkills: ['stash-encryption', 'stash-drizzle', 'stash-cli'],
}

describe('renderSetupPrompt — orient + route', () => {
  it('emits integration + package manager in the header', () => {
    const out = renderSetupPrompt(baseCtx)
    expect(out).toContain('Integration: `drizzle`')
    expect(out).toContain('Package manager: `pnpm`')
  })

  it('explicitly tells the agent its first response is a routing question, not an action', () => {
    const out = renderSetupPrompt(baseCtx)
    // The agent must orient + ask before editing anything. The earlier
    // version of this prompt drove the agent into a fixed TODO list which
    // pushed it past the user's actual intent.
    expect(out).toContain('Your first response')
    expect(out).toMatch(/Before any edits/)
    expect(out).toMatch(/orientation message/)
  })

  it('describes both supported paths and explicitly forbids path 2', () => {
    const out = renderSetupPrompt(baseCtx)
    expect(out).toContain('Path 1 — Add a new encrypted column from scratch')
    expect(out).toContain(
      'Path 3 — Migrate an existing populated column to encrypted',
    )
    expect(out).toContain('Path 2 — Convert a column in place (NOT SUPPORTED)')
  })

  it('names the lifecycle CLI commands inline in path 3', () => {
    const out = renderSetupPrompt(baseCtx)
    expect(out).toContain('pnpm dlx stash encrypt backfill')
    expect(out).toContain('pnpm dlx stash encrypt cutover')
    expect(out).toContain('pnpm dlx stash encrypt drop')
    expect(out).toContain('--confirm-dual-writes-deployed')
    expect(out).toContain('--force')
  })

  it('emits drizzle-kit commands in path 1 for drizzle integration', () => {
    const out = renderSetupPrompt(baseCtx)
    expect(out).toContain('pnpm exec drizzle-kit generate')
    expect(out).toContain('pnpm exec drizzle-kit migrate')
  })

  it('emits supabase migration commands for supabase integration', () => {
    const out = renderSetupPrompt({
      ...baseCtx,
      integration: 'supabase',
      installedSkills: ['stash-encryption', 'stash-supabase', 'stash-cli'],
    })
    expect(out).toContain('supabase migration new')
  })

  it('uses the right runner per package manager in path 1', () => {
    const npm = renderSetupPrompt({ ...baseCtx, packageManager: 'npm' })
    const bun = renderSetupPrompt({ ...baseCtx, packageManager: 'bun' })
    const yarn = renderSetupPrompt({ ...baseCtx, packageManager: 'yarn' })

    expect(npm).toContain('npx --no-install drizzle-kit generate')
    expect(bun).toContain('bun x drizzle-kit generate')
    expect(yarn).toContain('yarn drizzle-kit generate')
  })

  it('uses the right CLI runner for stash encrypt commands per package manager', () => {
    const npm = renderSetupPrompt({ ...baseCtx, packageManager: 'npm' })
    const bun = renderSetupPrompt({ ...baseCtx, packageManager: 'bun' })

    expect(npm).toContain('npx stash encrypt backfill')
    expect(bun).toContain('bunx stash encrypt backfill')
  })

  it('introduces every installed skill with a one-line purpose', () => {
    const out = renderSetupPrompt(baseCtx)
    expect(out).toContain('`stash-encryption`')
    expect(out).toContain('`stash-drizzle`')
    expect(out).toContain('`stash-cli`')
    // Each skill line should explain what the skill is for, not just name it.
    expect(out).toMatch(/`stash-encryption`.*lifecycle/i)
    expect(out).toMatch(/`stash-drizzle`.*Drizzle/i)
    expect(out).toMatch(/`stash-cli`.*command reference/i)
  })

  it('points each handoff at the right rule location', () => {
    const claude = renderSetupPrompt({ ...baseCtx, handoff: 'claude-code' })
    const codex = renderSetupPrompt({ ...baseCtx, handoff: 'codex' })
    const agents = renderSetupPrompt({ ...baseCtx, handoff: 'agents-md' })

    expect(claude).toContain('.claude/skills/')
    expect(codex).toContain('.codex/skills/')
    expect(codex).toContain('AGENTS.md')
    expect(agents).toContain('AGENTS.md')
    expect(agents).not.toContain('.claude/skills/')
    expect(agents).not.toContain('.codex/skills/')
  })

  it('handles the empty-skills fallback gracefully', () => {
    // Defensive case — when bundled skills are missing, installSkills
    // returns []. The rendered prompt must still make sense, just without
    // skill enumeration.
    const out = renderSetupPrompt({
      ...baseCtx,
      handoff: 'claude-code',
      installedSkills: [],
    })
    expect(out).not.toMatch(/the {2,}skill/)
    // Still describes both paths so the agent can route.
    expect(out).toContain('Path 1')
    expect(out).toContain('Path 3')
  })

  it('preserves stop-and-ask invariants', () => {
    const out = renderSetupPrompt(baseCtx)
    expect(out).toContain('## Stop and ask the user when')
    expect(out).toMatch(/path 2/i)
  })

  it('flags the bundler exclusion for projects using @cipherstash/stack', () => {
    // Skipping serverExternalPackages / webpack externals is the most
    // common Next.js footgun — the agent missed it on the spike project.
    // The prompt should call this out explicitly in the path-1 walkthrough
    // so it's visible without having to read the skill.
    const out = renderSetupPrompt(baseCtx)
    expect(out).toContain('serverExternalPackages')
    expect(out).toContain('@cipherstash/protect-ffi')
  })
})
