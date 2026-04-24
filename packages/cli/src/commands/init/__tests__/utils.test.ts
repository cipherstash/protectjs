import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  detectPackageManager,
  devInstallCommand,
  prodInstallCommand,
} from '../utils.js'

describe('detectPackageManager', () => {
  let tmp: string
  let originalUserAgent: string | undefined
  let cwdSpy: ReturnType<typeof vi.spyOn> | undefined

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'init-utils-test-'))
    originalUserAgent = process.env.npm_config_user_agent
    delete process.env.npm_config_user_agent
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmp)
  })

  afterEach(() => {
    cwdSpy?.mockRestore()
    rmSync(tmp, { recursive: true, force: true })
    if (originalUserAgent === undefined) {
      delete process.env.npm_config_user_agent
    } else {
      process.env.npm_config_user_agent = originalUserAgent
    }
  })

  it('defaults to npm when no lockfile and no user agent', () => {
    expect(detectPackageManager()).toBe('npm')
  })

  it('detects bun from bun.lock', () => {
    writeFileSync(join(tmp, 'bun.lock'), '')
    expect(detectPackageManager()).toBe('bun')
  })

  it('detects bun from bun.lockb', () => {
    writeFileSync(join(tmp, 'bun.lockb'), '')
    expect(detectPackageManager()).toBe('bun')
  })

  it('detects pnpm from pnpm-lock.yaml', () => {
    writeFileSync(join(tmp, 'pnpm-lock.yaml'), '')
    expect(detectPackageManager()).toBe('pnpm')
  })

  it('detects yarn from yarn.lock', () => {
    writeFileSync(join(tmp, 'yarn.lock'), '')
    expect(detectPackageManager()).toBe('yarn')
  })

  it('honours bunx via npm_config_user_agent without a lockfile', () => {
    process.env.npm_config_user_agent = 'bun/1.1.40 npm/? node/v22.3.0'
    expect(detectPackageManager()).toBe('bun')
  })

  it('honours pnpm dlx via user agent', () => {
    process.env.npm_config_user_agent = 'pnpm/9.0.0 npm/? node/v20.0.0'
    expect(detectPackageManager()).toBe('pnpm')
  })

  it('honours yarn dlx via user agent', () => {
    process.env.npm_config_user_agent = 'yarn/4.0.0 npm/? node/v20.0.0'
    expect(detectPackageManager()).toBe('yarn')
  })

  it('lets non-npm user agent win over a mismatched lockfile', () => {
    writeFileSync(join(tmp, 'pnpm-lock.yaml'), '')
    process.env.npm_config_user_agent = 'bun/1.1.40 npm/? node/v22.3.0'
    expect(detectPackageManager()).toBe('bun')
  })

  it('ignores npm/npx user agent in favour of lockfile', () => {
    writeFileSync(join(tmp, 'bun.lock'), '')
    process.env.npm_config_user_agent = 'npm/10.2.4 node/v20.0.0'
    expect(detectPackageManager()).toBe('bun')
  })
})

describe('prodInstallCommand', () => {
  it('returns bun add for bun', () => {
    expect(prodInstallCommand('bun', '@cipherstash/stack')).toBe(
      'bun add @cipherstash/stack',
    )
  })

  it('returns pnpm add for pnpm', () => {
    expect(prodInstallCommand('pnpm', '@cipherstash/stack')).toBe(
      'pnpm add @cipherstash/stack',
    )
  })

  it('returns yarn add for yarn', () => {
    expect(prodInstallCommand('yarn', '@cipherstash/stack')).toBe(
      'yarn add @cipherstash/stack',
    )
  })

  it('returns npm install for npm', () => {
    expect(prodInstallCommand('npm', '@cipherstash/stack')).toBe(
      'npm install @cipherstash/stack',
    )
  })
})

describe('devInstallCommand', () => {
  it('returns bun add -D for bun', () => {
    expect(devInstallCommand('bun', '@cipherstash/cli')).toBe(
      'bun add -D @cipherstash/cli',
    )
  })

  it('returns pnpm add -D for pnpm', () => {
    expect(devInstallCommand('pnpm', '@cipherstash/cli')).toBe(
      'pnpm add -D @cipherstash/cli',
    )
  })

  it('returns yarn add -D for yarn', () => {
    expect(devInstallCommand('yarn', '@cipherstash/cli')).toBe(
      'yarn add -D @cipherstash/cli',
    )
  })

  it('returns npm install -D for npm', () => {
    expect(devInstallCommand('npm', '@cipherstash/cli')).toBe(
      'npm install -D @cipherstash/cli',
    )
  })
})
