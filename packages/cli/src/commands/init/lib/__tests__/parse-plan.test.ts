import { describe, expect, it } from 'vitest'
import {
  type PlanSummary,
  parsePlanSummary,
  renderPlanSummary,
} from '../parse-plan.js'

describe('parsePlanSummary', () => {
  it('returns undefined when no summary block is present', () => {
    const md = '# CipherStash Encryption Plan\n\nNo summary here.\n'
    expect(parsePlanSummary(md)).toBeUndefined()
  })

  it('parses a well-formed summary block', () => {
    const md = `<!-- cipherstash:plan-summary
{
  "columns": [
    {"table": "users", "column": "email", "path": "new"},
    {"table": "users", "column": "phone", "path": "migrate"}
  ]
}
-->

# CipherStash Encryption Plan
`
    const summary = parsePlanSummary(md)
    expect(summary).toBeDefined()
    expect(summary?.columns).toHaveLength(2)
    expect(summary?.columns[0]).toEqual({
      table: 'users',
      column: 'email',
      path: 'new',
    })
  })

  it('returns undefined for malformed JSON inside the block', () => {
    const md = `<!-- cipherstash:plan-summary
{ not valid json
-->`
    expect(parsePlanSummary(md)).toBeUndefined()
  })

  it('returns undefined when shape does not match (missing columns)', () => {
    const md = `<!-- cipherstash:plan-summary
{"foo": "bar"}
-->`
    expect(parsePlanSummary(md)).toBeUndefined()
  })

  it('rejects entries with an unknown path value', () => {
    const md = `<!-- cipherstash:plan-summary
{"columns": [{"table": "t", "column": "c", "path": "convert-in-place"}]}
-->`
    expect(parsePlanSummary(md)).toBeUndefined()
  })

  it('rejects entries with empty table or column strings', () => {
    const empty = `<!-- cipherstash:plan-summary
{"columns": [{"table": "", "column": "c", "path": "new"}]}
-->`
    expect(parsePlanSummary(empty)).toBeUndefined()
  })

  it('tolerates extra unknown fields without dropping the parse', () => {
    // Future-proofing — agents may include estimated-deploys or other
    // ancillary keys. The parser should ignore them, not fail.
    const md = `<!-- cipherstash:plan-summary
{
  "columns": [{"table": "t", "column": "c", "path": "new"}],
  "estimatedDeploys": 1,
  "notes": "ignore me"
}
-->`
    const summary = parsePlanSummary(md)
    expect(summary?.columns).toHaveLength(1)
  })

  it('finds the block even with surrounding whitespace and extra newlines', () => {
    const md = `

<!--    cipherstash:plan-summary

{
  "columns": [{"table": "t", "column": "c", "path": "migrate"}]
}

-->

# Plan
`
    expect(parsePlanSummary(md)?.columns[0]?.path).toBe('migrate')
  })
})

describe('renderPlanSummary', () => {
  function summary(columns: PlanSummary['columns']): PlanSummary {
    return { columns }
  }

  it('reports column and table counts', () => {
    const out = renderPlanSummary(
      summary([
        { table: 'users', column: 'email', path: 'new' },
        { table: 'users', column: 'phone', path: 'migrate' },
        { table: 'orders', column: 'notes', path: 'migrate' },
      ]),
    )
    expect(out).toContain('3 columns across 2 tables')
  })

  it('uses singular forms when counts are 1', () => {
    const out = renderPlanSummary(
      summary([{ table: 'users', column: 'email', path: 'new' }]),
    )
    expect(out).toContain('1 column across 1 table')
    expect(out).not.toContain('1 columns')
    expect(out).not.toContain('1 tables')
  })

  it('describes each column with its path', () => {
    const out = renderPlanSummary(
      summary([
        { table: 'users', column: 'email', path: 'new' },
        { table: 'users', column: 'phone', path: 'migrate' },
      ]),
    )
    expect(out).toContain('users.email')
    expect(out).toContain('users.phone')
    expect(out).toContain('add new encrypted column')
    expect(out).toContain('migrate existing column')
  })

  it('mentions the staged 4-deploy lifecycle when any column is migrate-existing', () => {
    const out = renderPlanSummary(
      summary([
        { table: 'users', column: 'email', path: 'new' },
        { table: 'users', column: 'phone', path: 'migrate' },
      ]),
    )
    expect(out).toMatch(/staged across 4 deploys/i)
    expect(out).toMatch(/schema-add → backfill → cutover → drop/)
  })

  it('reports a single-deploy implementation when all columns are additive', () => {
    const out = renderPlanSummary(
      summary([
        { table: 'users', column: 'email', path: 'new' },
        { table: 'users', column: 'phone', path: 'new' },
      ]),
    )
    expect(out).toContain('single-deploy')
    expect(out).not.toMatch(/4 deploys/)
  })

  it('does not multiply deploy count by migrate-column count (deploys batch)', () => {
    // 3 migrate columns is still 4 deploys — schema-add covers all twins,
    // one backfill, one cutover, one drop. The renderer must not say "12
    // deploys" or anything similar.
    const out = renderPlanSummary(
      summary([
        { table: 'users', column: 'a', path: 'migrate' },
        { table: 'users', column: 'b', path: 'migrate' },
        { table: 'users', column: 'c', path: 'migrate' },
      ]),
    )
    expect(out).toContain('4 deploys')
    expect(out).not.toContain('12 deploys')
  })
})
