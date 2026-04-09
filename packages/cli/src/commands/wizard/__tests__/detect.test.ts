import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  detectIntegration,
  detectTypeScript,
  detectPackageManager,
} from '../lib/detect.js'

describe('detectIntegration', () => {
  let tmp: string

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'wizard-test-'))
  })

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  it('returns undefined when no package.json exists', () => {
    expect(detectIntegration(tmp)).toBeUndefined()
  })

  it('detects drizzle-orm', () => {
    writeFileSync(
      join(tmp, 'package.json'),
      JSON.stringify({ dependencies: { 'drizzle-orm': '^0.30.0' } }),
    )
    expect(detectIntegration(tmp)).toBe('drizzle')
  })

  it('detects supabase', () => {
    writeFileSync(
      join(tmp, 'package.json'),
      JSON.stringify({ dependencies: { '@supabase/supabase-js': '^2.0.0' } }),
    )
    expect(detectIntegration(tmp)).toBe('supabase')
  })

  it('detects prisma from dependencies', () => {
    writeFileSync(
      join(tmp, 'package.json'),
      JSON.stringify({ dependencies: { prisma: '^5.0.0' } }),
    )
    expect(detectIntegration(tmp)).toBe('prisma')
  })

  it('detects prisma from @prisma/client in devDependencies', () => {
    writeFileSync(
      join(tmp, 'package.json'),
      JSON.stringify({ devDependencies: { '@prisma/client': '^5.0.0' } }),
    )
    expect(detectIntegration(tmp)).toBe('prisma')
  })

  it('prefers drizzle over supabase when both present', () => {
    writeFileSync(
      join(tmp, 'package.json'),
      JSON.stringify({
        dependencies: {
          'drizzle-orm': '^0.30.0',
          '@supabase/supabase-js': '^2.0.0',
        },
      }),
    )
    expect(detectIntegration(tmp)).toBe('drizzle')
  })

  it('returns undefined for project with unrelated deps', () => {
    writeFileSync(
      join(tmp, 'package.json'),
      JSON.stringify({ dependencies: { express: '^4.0.0' } }),
    )
    expect(detectIntegration(tmp)).toBeUndefined()
  })
})

describe('detectTypeScript', () => {
  let tmp: string

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'wizard-test-'))
  })

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  it('returns false when no package.json or tsconfig', () => {
    expect(detectTypeScript(tmp)).toBe(false)
  })

  it('detects typescript from dependencies', () => {
    writeFileSync(
      join(tmp, 'package.json'),
      JSON.stringify({ devDependencies: { typescript: '^5.0.0' } }),
    )
    expect(detectTypeScript(tmp)).toBe(true)
  })

  it('detects typescript from tsconfig.json', () => {
    writeFileSync(join(tmp, 'tsconfig.json'), '{}')
    expect(detectTypeScript(tmp)).toBe(true)
  })
})

describe('detectPackageManager', () => {
  let tmp: string

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'wizard-test-'))
  })

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  it('returns undefined when no lockfile exists', () => {
    expect(detectPackageManager(tmp)).toBeUndefined()
  })

  it('detects bun from bun.lock', () => {
    writeFileSync(join(tmp, 'bun.lock'), '')
    const pm = detectPackageManager(tmp)
    expect(pm?.name).toBe('bun')
    expect(pm?.installCommand).toBe('bun add')
  })

  it('detects bun from bun.lockb', () => {
    writeFileSync(join(tmp, 'bun.lockb'), '')
    const pm = detectPackageManager(tmp)
    expect(pm?.name).toBe('bun')
  })

  it('detects pnpm', () => {
    writeFileSync(join(tmp, 'pnpm-lock.yaml'), '')
    const pm = detectPackageManager(tmp)
    expect(pm?.name).toBe('pnpm')
    expect(pm?.installCommand).toBe('pnpm add')
  })

  it('detects yarn', () => {
    writeFileSync(join(tmp, 'yarn.lock'), '')
    const pm = detectPackageManager(tmp)
    expect(pm?.name).toBe('yarn')
    expect(pm?.installCommand).toBe('yarn add')
  })

  it('detects npm', () => {
    writeFileSync(join(tmp, 'package-lock.json'), '')
    const pm = detectPackageManager(tmp)
    expect(pm?.name).toBe('npm')
    expect(pm?.installCommand).toBe('npm install')
  })
})
