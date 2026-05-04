import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SCRIPT = resolve(
  fileURLToPath(import.meta.url),
  '../../lint-no-hardcoded-runners.mjs',
)

function run(target) {
  try {
    execFileSync('node', [SCRIPT, target], { encoding: 'utf8' })
    return { exitCode: 0, output: '' }
  } catch (err) {
    return { exitCode: err.status, output: String(err.stdout) + String(err.stderr) }
  }
}

describe('lint-no-hardcoded-runners', () => {
  const fx = (name) => resolve(fileURLToPath(import.meta.url), `../fixtures/${name}`)

  it('passes on a clean file', () => {
    expect(run(fx('clean.ts')).exitCode).toBe(0)
  })

  it('fails on a hardcoded `npx ...` string literal', () => {
    const r = run(fx('offender.ts'))
    expect(r.exitCode).toBe(1)
    expect(r.output).toContain('offender.ts')
    expect(r.output).toMatch(/\bnpx\b/)
  })

  it("ignores `?? 'npx'` fallback expressions", () => {
    expect(run(fx('allowed-fallback.ts')).exitCode).toBe(0)
  })

  it('ignores comments mentioning npx', () => {
    expect(run(fx('allowed-comment.ts')).exitCode).toBe(0)
  })
})
