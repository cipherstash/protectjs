import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deriveMode, readContextFile } from '../index.js'

let cwd: string

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'stash-impl-'))
})

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true })
})

function writePlan(): void {
  mkdirSync(join(cwd, '.cipherstash'), { recursive: true })
  writeFileSync(join(cwd, '.cipherstash', 'plan.md'), '# plan\n', 'utf-8')
}

function writeContext(payload: Record<string, unknown>): void {
  mkdirSync(join(cwd, '.cipherstash'), { recursive: true })
  writeFileSync(
    join(cwd, '.cipherstash', 'context.json'),
    JSON.stringify(payload),
    'utf-8',
  )
}

describe('deriveMode (no --yolo)', () => {
  it('returns plan when no plan file exists', async () => {
    expect(await deriveMode(cwd, false)).toBe('plan')
  })

  it('returns implement when plan file exists', async () => {
    writePlan()
    expect(await deriveMode(cwd, false)).toBe('implement')
  })
})

describe('deriveMode (--yolo)', () => {
  it('is a no-op when a plan already exists — no prompt, returns implement', async () => {
    // The interactive confirmation must NOT fire when a plan exists, since
    // the safety checkpoint (the plan itself) has already happened.
    writePlan()
    expect(await deriveMode(cwd, true)).toBe('implement')
  })

  // The `--yolo + no plan` path is interactive (p.confirm). Covered by
  // manual smoke tests; mocking @clack/prompts isn't worth the churn here.
})

describe('readContextFile', () => {
  it('returns undefined when context.json is missing', () => {
    expect(readContextFile(cwd)).toBeUndefined()
  })

  it('returns the parsed context when present', () => {
    writeContext({
      cliVersion: '0.0.0',
      integration: 'drizzle',
      encryptionClientPath: './src/encryption/index.ts',
      packageManager: 'pnpm',
      installCommand: 'pnpm add @cipherstash/stack',
      envKeys: [],
      schemas: [],
      installedSkills: [],
      generatedAt: '2026-01-01T00:00:00.000Z',
    })
    const ctx = readContextFile(cwd)
    expect(ctx?.integration).toBe('drizzle')
    expect(ctx?.packageManager).toBe('pnpm')
  })

  it('returns undefined on malformed JSON rather than throwing', () => {
    mkdirSync(join(cwd, '.cipherstash'), { recursive: true })
    writeFileSync(
      join(cwd, '.cipherstash', 'context.json'),
      '{ not json',
      'utf-8',
    )
    expect(readContextFile(cwd)).toBeUndefined()
  })
})
