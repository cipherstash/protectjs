import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { render } from '../helpers/pty.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(
  readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'),
) as { version: string }

describe('stash CLI — non-interactive smoke', () => {
  it('--help prints the help banner and exits 0', async () => {
    const r = render(['--help'])
    const { exitCode } = await r.exit
    expect(exitCode).toBe(0)
    expect(r.output).toContain('CipherStash CLI v')
    expect(r.output).toContain('Usage: npx @cipherstash/cli')
    expect(r.output).toContain('init')
    expect(r.output).toContain('db install')
  })

  it('--version prints the package version', async () => {
    const r = render(['--version'])
    const { exitCode } = await r.exit
    expect(exitCode).toBe(0)
    expect(r.output.trim()).toContain(pkg.version)
  })

  it('unknown top-level command exits 1 with help', async () => {
    const r = render(['definitely-not-a-command'])
    const { exitCode } = await r.exit
    expect(exitCode).toBe(1)
    expect(r.output).toContain('Unknown command: definitely-not-a-command')
    expect(r.output).toContain('Usage: npx @cipherstash/cli')
  })

  it('auth with no subcommand prints auth help and exits 0', async () => {
    const r = render(['auth'])
    const { exitCode } = await r.exit
    expect(exitCode).toBe(0)
    expect(r.output).toContain('Usage: npx @cipherstash/cli auth')
    expect(r.output).toContain('login')
  })

  it('auth bogus-sub exits 1 with auth help', async () => {
    const r = render(['auth', 'bogus-sub'])
    const { exitCode } = await r.exit
    expect(exitCode).toBe(1)
    expect(r.output).toContain('Unknown auth command: bogus-sub')
  })

  it('db bogus-sub exits 1 with help', async () => {
    const r = render(['db', 'bogus-sub'])
    const { exitCode } = await r.exit
    expect(exitCode).toBe(1)
    expect(r.output).toContain('Unknown db subcommand: bogus-sub')
  })

  it('db migrate is a stub that exits 0 with a "not yet implemented" warning', async () => {
    const r = render(['db', 'migrate'])
    const { exitCode } = await r.exit
    expect(exitCode).toBe(0)
    expect(r.output).toContain('not yet implemented')
  })
})
