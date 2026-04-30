import { describe, expect, it } from 'vitest'
import { createSupabaseProvider } from '../supabase.js'

describe('createSupabaseProvider getNextSteps', () => {
  const provider = createSupabaseProvider()

  it('uses npx when package manager is npm', () => {
    const steps = provider.getNextSteps({}, 'npm')
    expect(steps[0]).toBe(
      'Install EQL: npx @cipherstash/cli db install --supabase (prompts for migration vs direct)',
    )
  })

  it('uses bunx when package manager is bun', () => {
    const steps = provider.getNextSteps({}, 'bun')
    expect(steps[0]).toBe(
      'Install EQL: bunx @cipherstash/cli db install --supabase (prompts for migration vs direct)',
    )
    expect(steps[2]).toContain('bunx @cipherstash/wizard') // wizard step is third
    for (const s of steps) expect(s).not.toMatch(/\bnpx\b/)
  })

  it('uses pnpm dlx when package manager is pnpm', () => {
    const steps = provider.getNextSteps({}, 'pnpm')
    expect(steps[0]).toContain('pnpm dlx @cipherstash/cli db install --supabase')
  })

  it('leaves the supabase CLI commands alone (those are not npm packages)', () => {
    const steps = provider.getNextSteps({}, 'bun')
    expect(steps.join('\n')).toContain('supabase db reset')
    expect(steps.join('\n')).toContain('supabase migration up')
  })
})
