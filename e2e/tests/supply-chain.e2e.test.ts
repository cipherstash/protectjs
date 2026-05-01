import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'

// Supply-chain enforcement tests. Each `it` corresponds to a control
// from lirantal/npm-security-best-practices applied in this repo.
// See skills/stash-supply-chain-security/SKILL.md for the rationale and
// how to bypass any of these for legitimate reasons.

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '../..')

const read = (p: string) => readFileSync(join(REPO_ROOT, p), 'utf8')
const readJson = (p: string) => JSON.parse(read(p))
const readYaml = (p: string) => parseYaml(read(p))

describe('supply chain — pnpm configuration', () => {
  it('packageManager is pnpm ≥ 10.26 (needed for blockExoticSubdeps)', () => {
    const pm = readJson('package.json').packageManager as string
    expect(pm).toMatch(/^pnpm@/)
    const [maj, min] = pm.replace('pnpm@', '').split('.').map(Number)
    expect(maj).toBeGreaterThanOrEqual(10)
    if (maj === 10) expect(min).toBeGreaterThanOrEqual(26)
  })

  it('pnpm-workspace.yaml sets minimumReleaseAge ≥ 3 days', () => {
    const ws = readYaml('pnpm-workspace.yaml') as { minimumReleaseAge?: number }
    expect(ws.minimumReleaseAge).toBeGreaterThanOrEqual(4320) // 3 days in minutes
  })

  it('pnpm-workspace.yaml sets blockExoticSubdeps: true', () => {
    const ws = readYaml('pnpm-workspace.yaml') as { blockExoticSubdeps?: boolean }
    expect(ws.blockExoticSubdeps).toBe(true)
  })

  it('onlyBuiltDependencies remains a small explicit allowlist (≤3 entries)', () => {
    const allow = (readJson('package.json').pnpm?.onlyBuiltDependencies ?? []) as string[]
    expect(Array.isArray(allow)).toBe(true)
    expect(allow.length).toBeLessThanOrEqual(3)
  })
})

describe('supply chain — registry pinning (.npmrc)', () => {
  it('pins @cipherstash scope and default registry to npmjs', () => {
    const npmrc = read('.npmrc')
    expect(npmrc).toMatch(/^@cipherstash:registry=https:\/\/registry\.npmjs\.org\/$/m)
    expect(npmrc).toMatch(/^registry=https:\/\/registry\.npmjs\.org\/$/m)
  })

  it('does NOT contain auth tokens', () => {
    const npmrc = read('.npmrc')
    expect(npmrc).not.toMatch(/_authToken/i)
    expect(npmrc).not.toMatch(/NPM_TOKEN/)
  })
})

describe('supply chain — pnpm-lock.yaml integrity', () => {
  it('every resolved package comes from registry.npmjs.org (no git/tarball deps)', () => {
    const lock = readYaml('pnpm-lock.yaml') as {
      packages?: Record<string, { resolution?: { tarball?: string; type?: string } }>
    }
    const offenders: string[] = []
    for (const [name, entry] of Object.entries(lock.packages ?? {})) {
      const resolution = entry.resolution
      if (!resolution) continue
      // Workspace `link:` entries appear as `directory` — those are first-party,
      // not a supply-chain risk, and pnpm catalogs require them.
      if (resolution.type === 'directory') continue
      if (resolution.type === 'git') {
        offenders.push(`${name} (type=git)`)
        continue
      }
      const tarball = resolution.tarball
      if (tarball && !tarball.startsWith('https://registry.npmjs.org/')) {
        offenders.push(`${name} (tarball=${tarball})`)
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('supply chain — CI hardening (.github/workflows/tests.yml)', () => {
  const workflow = readYaml('.github/workflows/tests.yml') as {
    jobs: Record<string, { steps: Array<{ run?: string; uses?: string; with?: Record<string, unknown> }> }>
  }

  it('every `pnpm install` invocation uses --frozen-lockfile', () => {
    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      const installSteps = job.steps.filter(
        (s) => typeof s.run === 'string' && /\bpnpm\s+install\b/.test(s.run),
      )
      for (const step of installSteps) {
        expect(step.run, `${jobName} step "${step.run}"`).toMatch(/--frozen-lockfile/)
      }
    }
  })

  it('every job runs on Node 22', () => {
    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      const setup = job.steps.find((s) => typeof s.uses === 'string' && s.uses.startsWith('actions/setup-node'))
      if (!setup) continue
      expect(String(setup.with?.['node-version']), `${jobName} node version`).toBe('22')
    }
  })
})

describe('supply chain — automated dependency updates (Dependabot)', () => {
  const db = readYaml('.github/dependabot.yml') as {
    updates: Array<{
      'package-ecosystem': string
      cooldown?: { 'default-days'?: number; 'semver-major-days'?: number }
    }>
  }

  it('npm ecosystem has a ≥ 3 day cooldown', () => {
    const npm = db.updates.find((u) => u['package-ecosystem'] === 'npm')
    expect(npm).toBeDefined()
    expect(npm?.cooldown?.['default-days']).toBeGreaterThanOrEqual(3)
  })

  it('github-actions ecosystem is also covered', () => {
    expect(db.updates.find((u) => u['package-ecosystem'] === 'github-actions')).toBeDefined()
  })
})

describe('supply chain — governance (CODEOWNERS)', () => {
  it('protects supply-chain critical paths', () => {
    const co = read('.github/CODEOWNERS')
    // Each path that, if changed silently, could weaken the chain.
    for (const path of [
      'pnpm-workspace.yaml',
      'pnpm-lock.yaml',
      'dependabot.yml',
      '.npmrc',
      '.github/workflows/',
    ]) {
      expect(co, `expected CODEOWNERS to mention ${path}`).toContain(path)
    }
  })
})
