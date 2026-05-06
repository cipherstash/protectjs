import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildStages, nextAction, readProjectStatus } from '../index.js'

let cwd: string

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'stash-status-'))
})

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true })
})

function writeContext(payload: Record<string, unknown>): void {
  mkdirSync(join(cwd, '.cipherstash'), { recursive: true })
  writeFileSync(
    join(cwd, '.cipherstash', 'context.json'),
    JSON.stringify(payload),
    'utf-8',
  )
}

function writePlan(): void {
  mkdirSync(join(cwd, '.cipherstash'), { recursive: true })
  writeFileSync(join(cwd, '.cipherstash', 'plan.md'), '# plan\n', 'utf-8')
}

function writeSetupPrompt(): void {
  mkdirSync(join(cwd, '.cipherstash'), { recursive: true })
  writeFileSync(
    join(cwd, '.cipherstash', 'setup-prompt.md'),
    '# prompt\n',
    'utf-8',
  )
}

const sampleContext = {
  cliVersion: '0.0.0',
  integration: 'drizzle' as const,
  encryptionClientPath: './src/encryption/index.ts',
  packageManager: 'pnpm' as const,
  installCommand: 'pnpm add @cipherstash/stack',
  envKeys: [],
  schemas: [
    { tableName: 'users', columns: [] },
    { tableName: 'orders', columns: [] },
  ],
  installedSkills: [],
  generatedAt: '2026-01-01T00:00:00.000Z',
}

describe('readProjectStatus', () => {
  it('reports a virgin project as uninitialized', () => {
    const status = readProjectStatus(cwd)
    expect(status.initialized).toBe(false)
    expect(status.planExists).toBe(false)
    expect(status.agentEngaged).toBe(false)
  })

  it('reports init-only state when only context.json exists', () => {
    writeContext(sampleContext)
    const status = readProjectStatus(cwd)
    expect(status.initialized).toBe(true)
    expect(status.context?.integration).toBe('drizzle')
    expect(status.planExists).toBe(false)
    expect(status.agentEngaged).toBe(false)
  })

  it('reports plan written once plan.md exists', () => {
    writeContext(sampleContext)
    writePlan()
    const status = readProjectStatus(cwd)
    expect(status.planExists).toBe(true)
  })

  it('reports agentEngaged when setup-prompt.md exists', () => {
    writeContext(sampleContext)
    writeSetupPrompt()
    const status = readProjectStatus(cwd)
    expect(status.agentEngaged).toBe(true)
  })

  it('treats malformed context.json as not-initialized rather than throwing', () => {
    mkdirSync(join(cwd, '.cipherstash'), { recursive: true })
    writeFileSync(
      join(cwd, '.cipherstash', 'context.json'),
      '{ not json',
      'utf-8',
    )
    const status = readProjectStatus(cwd)
    expect(status.initialized).toBe(false)
  })
})

describe('buildStages', () => {
  it('marks every stage pending in a virgin project', () => {
    const stages = buildStages(readProjectStatus(cwd), 'pnpm dlx stash')
    expect(stages.map((s) => s.status)).toEqual([
      'pending',
      'pending',
      'pending',
    ])
    // Init detail nudges the user to begin.
    expect(stages[0].detail).toMatch(/init/)
  })

  it('marks Initialized done and shows integration + table count when context exists', () => {
    writeContext(sampleContext)
    const stages = buildStages(readProjectStatus(cwd), 'pnpm dlx stash')
    expect(stages[0].status).toBe('done')
    expect(stages[0].detail).toContain('drizzle')
    expect(stages[0].detail).toContain('pnpm')
    expect(stages[0].detail).toContain('2 tables')
  })

  it('uses singular "table" for a one-table project', () => {
    writeContext({
      ...sampleContext,
      schemas: [{ tableName: 'x', columns: [] }],
    })
    const stages = buildStages(readProjectStatus(cwd), 'pnpm dlx stash')
    expect(stages[0].detail).toContain('1 table')
    expect(stages[0].detail).not.toContain('1 tables')
  })

  it('marks Plan written done and shows the plan path when plan exists', () => {
    writeContext(sampleContext)
    writePlan()
    const stages = buildStages(readProjectStatus(cwd), 'pnpm dlx stash')
    expect(stages[1].status).toBe('done')
    expect(stages[1].detail).toContain('.cipherstash/plan.md')
  })

  it('points at `plan` for next-step when init done but plan missing', () => {
    writeContext(sampleContext)
    const stages = buildStages(readProjectStatus(cwd), 'pnpm dlx stash')
    expect(stages[1].status).toBe('pending')
    expect(stages[1].detail).toMatch(/plan/)
    expect(stages[2].detail).toMatch(/waiting on plan/)
  })

  it('keeps Implementation pending even after agent engagement (DB state lives in encrypt status)', () => {
    writeContext(sampleContext)
    writePlan()
    writeSetupPrompt()
    const stages = buildStages(readProjectStatus(cwd), 'pnpm dlx stash')
    expect(stages[2].status).toBe('pending')
    expect(stages[2].detail).toContain('encrypt status')
  })
})

describe('nextAction', () => {
  it('points at init when uninitialized', () => {
    expect(nextAction(readProjectStatus(cwd), 'pnpm dlx stash')).toMatch(/init/)
  })

  it('points at `plan` when initialized but no plan exists', () => {
    writeContext(sampleContext)
    expect(nextAction(readProjectStatus(cwd), 'pnpm dlx stash')).toMatch(
      /\bplan\b/,
    )
  })

  it('asks the user to review the plan before implementing', () => {
    writeContext(sampleContext)
    writePlan()
    const action = nextAction(readProjectStatus(cwd), 'pnpm dlx stash')
    expect(action).toMatch(/plan\.md/)
    expect(action).toMatch(/impl/)
  })

  it('routes to encrypt status once the agent has been engaged', () => {
    writeContext(sampleContext)
    writePlan()
    writeSetupPrompt()
    expect(nextAction(readProjectStatus(cwd), 'pnpm dlx stash')).toMatch(
      /encrypt status/,
    )
  })
})
