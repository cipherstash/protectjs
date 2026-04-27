import type {
  Check,
  CheckContext,
  CheckResult,
  Report,
  RunnerOutcome,
  Summary,
} from './types.js'

/**
 * Execute a check and coerce any thrown error into a structured result. A
 * single broken check shouldn't kill the report.
 */
async function runCheck(check: Check, ctx: CheckContext): Promise<CheckResult> {
  try {
    return await check.run(ctx)
  } catch (cause) {
    return {
      status: 'fail',
      message: `${check.title} threw an unexpected error`,
      cause,
    }
  }
}

function dependencyFailure(
  check: Check,
  byId: ReadonlyMap<string, CheckResult>,
): string | undefined {
  if (!check.dependsOn) return undefined
  for (const depId of check.dependsOn) {
    const depResult = byId.get(depId)
    if (!depResult) {
      return depId
    }
    if (depResult.status !== 'pass') {
      return depId
    }
  }
  return undefined
}

export async function runChecks(
  checks: ReadonlyArray<Check>,
  ctx: CheckContext,
): Promise<Report> {
  const outcomes: RunnerOutcome[] = []
  const byId = new Map<string, CheckResult>()

  for (const check of checks) {
    const blockingDep = dependencyFailure(check, byId)
    if (blockingDep) {
      const result: CheckResult = {
        status: 'skip',
        message: `skipped — depends on ${blockingDep}`,
      }
      outcomes.push({ check, result })
      byId.set(check.id, result)
      continue
    }

    const result = await runCheck(check, ctx)
    outcomes.push({ check, result })
    byId.set(check.id, result)
  }

  return {
    cliVersion: ctx.cliVersion,
    timestamp: new Date().toISOString(),
    summary: summarise(outcomes),
    outcomes,
  }
}

export function summarise(outcomes: ReadonlyArray<RunnerOutcome>): Summary {
  const summary: Summary = { error: 0, warn: 0, info: 0, pass: 0, skip: 0 }
  for (const { check, result } of outcomes) {
    if (result.status === 'pass') {
      summary.pass++
    } else if (result.status === 'skip') {
      summary.skip++
    } else {
      // status === 'fail' — bucket by the check's declared severity
      summary[check.severity]++
    }
  }
  return summary
}

/**
 * Map the report to a process exit code:
 *  - 0 if no errors or warnings failed (info failures are fine)
 *  - 1 if any `error` severity check failed
 *  - 2 if any `warn` severity check failed (but no errors)
 */
export function exitCodeForReport(report: Report): 0 | 1 | 2 {
  if (report.summary.error > 0) return 1
  if (report.summary.warn > 0) return 2
  return 0
}
