import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readContextFile } from '../read-context.js'

let cwd: string

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'stash-context-'))
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
