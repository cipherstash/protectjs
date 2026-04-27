import type { Report } from '../types.js'

/**
 * Serialise a report to the public JSON shape. The schema is a stability
 * contract — see __tests__/format-json.test.ts for the frozen snapshot.
 */
export function renderJson(report: Report): string {
  return JSON.stringify(
    {
      cliVersion: report.cliVersion,
      timestamp: report.timestamp,
      summary: report.summary,
      checks: report.outcomes.map(({ check, result }) => ({
        id: check.id,
        title: check.title,
        category: check.category,
        severity: check.severity,
        status: result.status,
        message: result.message,
        fixHint: result.fixHint,
        details: result.details,
      })),
    },
    null,
    2,
  )
}
