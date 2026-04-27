import { describe, expect, it } from 'vitest'
import { exitCodeForReport, runChecks } from '../runner.js'
import type { Check, CheckContext } from '../types.js'

function ctx(): CheckContext {
  return {
    cwd: '/tmp/doctor',
    cliVersion: '0.0.0-test',
    flags: {
      json: false,
      fix: false,
      yes: false,
      verbose: false,
      skipDb: false,
      only: [],
    },
    cache: {
      cwd: '/tmp/doctor',
      packageJson: () => undefined,
      stashConfig: async () => ({ ok: false, reason: 'not-found' }),
      encryptClient: async () => ({ ok: false, reason: 'no-config' }),
      token: async () => ({ ok: false }),
      integration: () => undefined,
      hasTypeScript: () => false,
    },
  }
}

function passing(id: string, category: Check['category'] = 'project'): Check {
  return {
    id,
    title: id,
    category,
    severity: 'info',
    run: async () => ({ status: 'pass' }),
  }
}

function failing(
  id: string,
  severity: Check['severity'],
  dependsOn?: string[],
): Check {
  return {
    id,
    title: id,
    category: 'project',
    severity,
    dependsOn,
    run: async () => ({ status: 'fail', message: 'nope' }),
  }
}

describe('runChecks dependency short-circuit', () => {
  it('skips a check whose dependency failed', async () => {
    const a = failing('a', 'error')
    const b: Check = {
      id: 'b',
      title: 'b',
      category: 'project',
      severity: 'error',
      dependsOn: ['a'],
      run: async () => ({ status: 'pass' }),
    }
    const report = await runChecks([a, b], ctx())
    expect(report.outcomes[0].result.status).toBe('fail')
    expect(report.outcomes[1].result.status).toBe('skip')
    expect(report.outcomes[1].result.message).toContain('a')
  })

  it('does not short-circuit when the dependency passed', async () => {
    const a = passing('a')
    const b: Check = {
      id: 'b',
      title: 'b',
      category: 'project',
      severity: 'error',
      dependsOn: ['a'],
      run: async () => ({ status: 'pass' }),
    }
    const report = await runChecks([a, b], ctx())
    expect(report.outcomes[1].result.status).toBe('pass')
  })

  it('wraps a thrown exception into a fail result', async () => {
    const boom: Check = {
      id: 'boom',
      title: 'boom',
      category: 'project',
      severity: 'error',
      run: async () => {
        throw new Error('kaboom')
      },
    }
    const report = await runChecks([boom], ctx())
    expect(report.outcomes[0].result.status).toBe('fail')
    expect(report.outcomes[0].result.cause).toBeInstanceOf(Error)
  })
})

describe('exitCodeForReport', () => {
  it('returns 0 when there are no failing error/warn checks', async () => {
    const report = await runChecks([passing('ok')], ctx())
    expect(exitCodeForReport(report)).toBe(0)
  })

  it('returns 1 when an error-severity check failed', async () => {
    const report = await runChecks([failing('a', 'error')], ctx())
    expect(exitCodeForReport(report)).toBe(1)
  })

  it('returns 2 when only warn-severity checks failed', async () => {
    const report = await runChecks([failing('w', 'warn')], ctx())
    expect(exitCodeForReport(report)).toBe(2)
  })

  it('returns 0 when only info-severity checks failed', async () => {
    const report = await runChecks([failing('i', 'info')], ctx())
    expect(exitCodeForReport(report)).toBe(0)
  })

  it('prefers exit 1 when a mix of error and warn fail', async () => {
    const report = await runChecks(
      [failing('e', 'error'), failing('w', 'warn')],
      ctx(),
    )
    expect(exitCodeForReport(report)).toBe(1)
  })
})

describe('summary aggregation', () => {
  it('counts pass and skip separately from severity buckets', async () => {
    const report = await runChecks(
      [
        passing('a'),
        failing('b', 'error'),
        failing('c', 'warn'),
        failing('d', 'info'),
      ],
      ctx(),
    )
    expect(report.summary).toEqual({
      error: 1,
      warn: 1,
      info: 1,
      pass: 1,
      skip: 0,
    })
  })
})
