import * as p from '@clack/prompts'
import pc from 'picocolors'
import type {
  CheckCategory,
  CheckSeverity,
  CheckStatus,
  Report,
  RunnerOutcome,
} from '../types.js'

const CATEGORY_ORDER: ReadonlyArray<CheckCategory> = [
  'project',
  'config',
  'auth',
  'env',
  'database',
  'integration',
]

const CATEGORY_LABEL: Record<CheckCategory, string> = {
  project: 'Project',
  config: 'Config',
  auth: 'Auth',
  env: 'Environment',
  database: 'Database',
  integration: 'Integration',
}

/**
 * Pick a glyph + colour for an outcome. `fail` splits by severity so warnings
 * don't read like outright errors.
 */
function marker(status: CheckStatus, severity: CheckSeverity): string {
  if (status === 'pass') return pc.green('✔')
  if (status === 'skip') return pc.dim('○')
  // status === 'fail'
  if (severity === 'error') return pc.red('✖')
  if (severity === 'warn') return pc.yellow('⚠')
  return pc.blue('ℹ')
}

function titleLine(outcome: RunnerOutcome): string {
  const { check, result } = outcome
  const base = result.message
    ? `${check.title} — ${result.message}`
    : check.title
  return `  ${marker(result.status, check.severity)} ${base}`
}

/**
 * Human-oriented renderer. Pure — callers pipe the returned string to stdout
 * (or to a clack log level) so tests can assert on the exact output.
 */
export function renderHuman(report: Report, verbose = false): string {
  const lines: string[] = []
  lines.push(pc.bold('▲ stash doctor'))
  lines.push('')

  const byCategory = new Map<CheckCategory, RunnerOutcome[]>()
  for (const outcome of report.outcomes) {
    const list = byCategory.get(outcome.check.category) ?? []
    list.push(outcome)
    byCategory.set(outcome.check.category, list)
  }

  for (const category of CATEGORY_ORDER) {
    const outcomes = byCategory.get(category)
    if (!outcomes || outcomes.length === 0) continue
    lines.push(`${pc.cyan('◆')} ${pc.bold(CATEGORY_LABEL[category])}`)

    for (const outcome of outcomes) {
      const { check, result } = outcome
      const showDetail =
        result.status === 'fail' ||
        (verbose && (result.status !== 'pass' || check.severity !== 'info'))

      if (!verbose && result.status === 'pass') {
        lines.push(titleLine(outcome))
        continue
      }
      lines.push(titleLine(outcome))
      if (result.fixHint && showDetail) {
        for (const hint of result.fixHint.split('\n')) {
          lines.push(`    ${pc.dim('→')} ${hint}`)
        }
      }
      if (verbose && result.cause) {
        const causeStr =
          result.cause instanceof Error
            ? (result.cause.stack ?? result.cause.message)
            : String(result.cause)
        for (const l of causeStr.split('\n')) {
          lines.push(`    ${pc.dim(l)}`)
        }
      }
    }
    lines.push('')
  }

  lines.push(pc.dim('─'.repeat(40)))
  const { error, warn, info, pass, skip } = report.summary
  const parts: string[] = []
  parts.push(`${pc.red(`${error} error${error === 1 ? '' : 's'}`)}`)
  parts.push(`${pc.yellow(`${warn} warning${warn === 1 ? '' : 's'}`)}`)
  parts.push(`${pc.blue(`${info} info`)}`)
  parts.push(`${pc.green(`${pass} passed`)}`)
  if (skip > 0) parts.push(pc.dim(`${skip} skipped`))
  lines.push(parts.join(pc.dim(' · ')))
  return lines.join('\n')
}

/**
 * Thin wrapper that prints the human report and emits a clack outro summary.
 * Kept here so the runner doesn't need to know about clack.
 */
export function printHuman(report: Report, verbose = false): void {
  console.log(renderHuman(report, verbose))
  if (report.summary.error > 0) {
    p.log.error('One or more checks failed.')
  } else if (report.summary.warn > 0) {
    p.log.warn('Some warnings found.')
  } else {
    p.log.success('All checks passed.')
  }
}
