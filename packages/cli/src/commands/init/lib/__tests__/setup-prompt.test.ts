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
  mode: 'implement',
  installedSkills: ['stash-encryption', 'stash-drizzle', 'stash-cli'],
}

describe('renderSetupPrompt — orient + route (implement mode)', () => {
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

  it('describes both supported flows and explicitly forbids in-place conversion', () => {
    const out = renderSetupPrompt(baseCtx)
    expect(out).toContain('### Add a new encrypted column')
    expect(out).toContain('### Migrate an existing column to encrypted')
    expect(out).toContain('### Converting in place is not supported')
  })

  it('mentions the staged twin model in the migrate-existing flow', () => {
    const out = renderSetupPrompt(baseCtx)
    expect(out).toMatch(/<col>_encrypted/)
    expect(out).toMatch(/dual-?writ/i)
  })

  it('names the lifecycle CLI commands inline in the migrate-existing flow', () => {
    const out = renderSetupPrompt(baseCtx)
    expect(out).toContain('pnpm dlx stash encrypt backfill')
    expect(out).toContain('pnpm dlx stash encrypt cutover')
    expect(out).toContain('pnpm dlx stash encrypt drop')
    expect(out).toContain('--confirm-dual-writes-deployed')
    expect(out).toContain('--force')
  })

  it('emits drizzle-kit commands in the add-new-column flow for drizzle integration', () => {
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

  it('uses the right runner per package manager in the add-new-column flow', () => {
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
    // Still describes both flows so the agent can route.
    expect(out).toContain('### Add a new encrypted column')
    expect(out).toContain('### Migrate an existing column to encrypted')
  })

  it('preserves stop-and-ask invariants', () => {
    const out = renderSetupPrompt(baseCtx)
    expect(out).toContain('## Stop and ask the user when')
    expect(out).toMatch(/convert a populated column in place/i)
  })

  it('flags the bundler exclusion for projects using @cipherstash/stack', () => {
    // Skipping serverExternalPackages / webpack externals is the most
    // common Next.js footgun — the agent missed it on the spike project.
    // The prompt should call this out explicitly in the add-new-column
    // walkthrough so it's visible without having to read the skill.
    const out = renderSetupPrompt(baseCtx)
    expect(out).toContain('serverExternalPackages')
    expect(out).toContain('@cipherstash/protect-ffi')
  })

  it('directs the agent to read .cipherstash/plan.md first if it exists', () => {
    // Plan mode produces .cipherstash/plan.md; if the user later runs init
    // again in implement mode, the plan must be the source of truth — not
    // a re-asked routing question.
    const out = renderSetupPrompt(baseCtx)
    expect(out).toContain('.cipherstash/plan.md')
    expect(out).toMatch(/source of truth/i)
  })
})

describe('renderSetupPrompt — plan mode', () => {
  const planCtx: SetupPromptContext = { ...baseCtx, mode: 'plan' }

  it('frames the deliverable as a plan file, not code changes', () => {
    const out = renderSetupPrompt(planCtx)
    expect(out).toContain('# CipherStash setup — write a plan')
    expect(out).toContain('.cipherstash/plan.md')
    expect(out).toMatch(/produce a plan file/i)
  })

  it('explicitly forbids mutating commands during planning', () => {
    const out = renderSetupPrompt(planCtx)
    expect(out).toContain('## What you must NOT do')
    expect(out).toMatch(/db push/)
    expect(out).toMatch(/encrypt backfill/)
    expect(out).toMatch(/encrypt cutover/)
    expect(out).toMatch(/encrypt drop/)
  })

  it('allows read-only inspection commands', () => {
    const out = renderSetupPrompt(planCtx)
    expect(out).toMatch(/db status/)
    expect(out).toMatch(/Read-only/i)
  })

  it('tells the agent to offer copying the plan into docs/plans when it exists', () => {
    const out = renderSetupPrompt(planCtx)
    expect(out).toContain('docs/plans/')
    expect(out).toMatch(/offer to copy/i)
  })

  it('lists project-specific risk classes the plan must cover', () => {
    const out = renderSetupPrompt(planCtx)
    expect(out).toMatch(/bundler exclusion/i)
    expect(out).toMatch(/top-level-await/i)
    expect(out).toMatch(/partial CipherStash/i)
  })

  it('requires the plan to identify which lifecycle path applies per column', () => {
    const out = renderSetupPrompt(planCtx)
    expect(out).toMatch(/path 1/i)
    expect(out).toMatch(/path 3/i)
    expect(out).toMatch(/four-deploy sequence/i)
  })

  it('still tells the agent its first response is an orientation message, not action', () => {
    const out = renderSetupPrompt(planCtx)
    expect(out).toContain('## Your first response')
    expect(out).toMatch(/orientation message/i)
  })

  it('references concrete table/column names from .cipherstash/context.json', () => {
    const out = renderSetupPrompt(planCtx)
    expect(out).toContain('.cipherstash/context.json')
  })

  it('instructs the agent to begin the plan with a machine-readable summary block', () => {
    // `stash impl` parses this block to render a confirmation panel before
    // launching implementation. If the agent forgets it, plan-summary
    // gracefully degrades — but the prompt still has to ask for it so
    // most plans get a structured summary.
    const out = renderSetupPrompt(planCtx)
    expect(out).toContain('cipherstash:plan-summary')
    expect(out).toContain('"columns"')
    // The instruction shows the union form `"new" | "migrate"`; both
    // values must appear so the agent knows what to choose between.
    expect(out).toContain('"new"')
    expect(out).toContain('"migrate"')
    expect(out).toMatch(/at the very top of the file/i)
  })

  it('preserves the integration + package manager header in plan mode', () => {
    const out = renderSetupPrompt(planCtx)
    expect(out).toContain('Integration: `drizzle`')
    expect(out).toContain('Package manager: `pnpm`')
  })

  it('does not emit the implement-mode flow walkthroughs verbatim', () => {
    // Plan mode summarises the two options in one line each rather than
    // restating the full numbered walkthroughs; the walkthroughs live in
    // the implement prompt.
    const out = renderSetupPrompt(planCtx)
    expect(out).not.toContain('### Add a new encrypted column')
    expect(out).not.toContain('### Migrate an existing column to encrypted')
  })
})
