/**
 * Parse and render `.cipherstash/plan.md` summary blocks.
 *
 * The agent is instructed (in `renderPlanPrompt`) to begin the plan file
 * with an HTML-comment block carrying a structured JSON summary:
 *
 *   <!-- cipherstash:plan-summary
 *   {
 *     "columns": [
 *       {"table": "users", "column": "email", "path": "new"},
 *       {"table": "users", "column": "phone", "path": "migrate"}
 *     ]
 *   }
 *   -->
 *
 * `stash impl` parses this block to render a confirmation panel before
 * dispatching to the implementation handoff. Plans without the block (or
 * with a malformed one) fall back to a soft "open the plan in your editor"
 * message — never an error. Older plans pre-dating this feature are still
 * usable.
 */

export type PlanPath = 'new' | 'migrate'

export interface PlanColumn {
  table: string
  column: string
  path: PlanPath
}

export interface PlanSummary {
  columns: PlanColumn[]
}

const SUMMARY_BLOCK_RE = /<!--\s*cipherstash:plan-summary\s*([\s\S]*?)\s*-->/

function isPlanColumn(x: unknown): x is PlanColumn {
  if (!x || typeof x !== 'object') return false
  const c = x as Record<string, unknown>
  return (
    typeof c.table === 'string' &&
    c.table.length > 0 &&
    typeof c.column === 'string' &&
    c.column.length > 0 &&
    (c.path === 'new' || c.path === 'migrate')
  )
}

function isPlanSummary(x: unknown): x is PlanSummary {
  if (!x || typeof x !== 'object') return false
  const obj = x as Record<string, unknown>
  return Array.isArray(obj.columns) && obj.columns.every(isPlanColumn)
}

/**
 * Extract the machine-readable plan summary, or `undefined` if the plan
 * has no summary block (or one that doesn't match the schema). Never
 * throws — malformed input is treated as "no summary."
 */
export function parsePlanSummary(content: string): PlanSummary | undefined {
  const match = content.match(SUMMARY_BLOCK_RE)
  if (!match) return undefined
  try {
    const parsed = JSON.parse(match[1]) as unknown
    if (!isPlanSummary(parsed)) return undefined
    return parsed
  } catch {
    return undefined
  }
}

const COLUMN_LABEL_WIDTH = 20

/**
 * Render the plan summary as the body of a `p.note` panel.
 *
 *   3 columns across 2 tables
 *
 *   ◇ users.email          add new encrypted column
 *   ◇ users.phone          migrate existing column
 *   ◇ orders.notes         migrate existing column
 *
 *   Includes migrate-existing columns — implementation is staged across
 *   4 deploys (schema-add → backfill → cutover → drop).
 *
 * Deploys are reported as a flat 4 (not 4 per migrate column) because the
 * lifecycle batches columns: one schema-add deploy covers every twin, one
 * backfill covers every column, etc.
 */
export function renderPlanSummary(summary: PlanSummary): string {
  const tables = new Set(summary.columns.map((c) => c.table))
  const migrateCount = summary.columns.filter(
    (c) => c.path === 'migrate',
  ).length

  const colCount = summary.columns.length
  const tableCount = tables.size

  const header = `${colCount} column${colCount === 1 ? '' : 's'} across ${tableCount} table${tableCount === 1 ? '' : 's'}`

  const rows = summary.columns.map((c) => {
    const desc =
      c.path === 'new' ? 'add new encrypted column' : 'migrate existing column'
    return `◇ ${`${c.table}.${c.column}`.padEnd(COLUMN_LABEL_WIDTH)} ${desc}`
  })

  const footer =
    migrateCount > 0
      ? `Includes migrate-existing column${migrateCount === 1 ? '' : 's'} — implementation is staged across 4 deploys (schema-add → backfill → cutover → drop).`
      : 'All columns are additive — single-deploy implementation.'

  return [header, '', ...rows, '', footer].join('\n')
}
