import {
  ENCRYPTED_EQ_TERM_CODEC_ID,
  ENCRYPTED_MATCH_TERM_CODEC_ID,
  ENCRYPTED_ORE_TERM_CODEC_ID,
  ENCRYPTED_STE_VEC_SELECTOR_CODEC_ID,
  ENCRYPTED_STORAGE_CODEC_ID,
} from '@/prisma/core/constants'
import { encryptedQueryOperations } from '@/prisma/core/operation-templates'
import { describe, expect, it } from 'vitest'

/**
 * Operator descriptors are the contract between the runtime extension and
 * the framework's lowering planner. Each test pins:
 *
 *   - The exact `eql_v2.<op>(...)` SQL template (verified against the
 *     Drizzle implementation in `src/drizzle/operators.ts`).
 *   - The per-arg `codecId`, which routes the user-side plaintext through
 *     the matching query-term codec at lower-time.
 *
 * Drift from the Drizzle implementation is the most likely failure mode of
 * the Phase 2 integration; pinning the templates here catches it loudly.
 */

function findOp(method: string) {
  const op = encryptedQueryOperations.find((o) => o.method === method)
  if (!op) {
    throw new Error(`Operator descriptor for '${method}' is missing`)
  }
  return op
}

describe('equality operators', () => {
  it('eq lowers to eql_v2.eq with the eq-term codec on the value side', () => {
    const op = findOp('eq')
    expect(op.lowering.template).toBe('eql_v2.eq({{self}}, {{arg0}})')
    expect(op.args[0]?.codecId).toBe(ENCRYPTED_STORAGE_CODEC_ID)
    expect(op.args[1]?.codecId).toBe(ENCRYPTED_EQ_TERM_CODEC_ID)
    expect(op.returns.codecId).toBe('core/bool@1')
  })

  it('neq lowers to eql_v2.neq with the eq-term codec on the value side', () => {
    const op = findOp('neq')
    expect(op.lowering.template).toBe('eql_v2.neq({{self}}, {{arg0}})')
    expect(op.args[1]?.codecId).toBe(ENCRYPTED_EQ_TERM_CODEC_ID)
  })
})

describe('range operators', () => {
  for (const op of ['gt', 'gte', 'lt', 'lte'] as const) {
    it(`${op} lowers to eql_v2.${op} with the ORE-term codec on the value side`, () => {
      const desc = findOp(op)
      expect(desc.lowering.template).toBe(`eql_v2.${op}({{self}}, {{arg0}})`)
      expect(desc.args[1]?.codecId).toBe(ENCRYPTED_ORE_TERM_CODEC_ID)
    })
  }

  it('between lowers to eql_v2.gte AND eql_v2.lte with two ORE-term args', () => {
    const op = findOp('between')
    expect(op.lowering.template).toBe(
      '(eql_v2.gte({{self}}, {{arg0}}) AND eql_v2.lte({{self}}, {{arg1}}))',
    )
    expect(op.args).toHaveLength(3)
    expect(op.args[1]?.codecId).toBe(ENCRYPTED_ORE_TERM_CODEC_ID)
    expect(op.args[2]?.codecId).toBe(ENCRYPTED_ORE_TERM_CODEC_ID)
  })

  it('notBetween wraps the between body in NOT (...)', () => {
    const op = findOp('notBetween')
    expect(op.lowering.template).toBe(
      'NOT (eql_v2.gte({{self}}, {{arg0}}) AND eql_v2.lte({{self}}, {{arg1}}))',
    )
  })
})

describe('text-search operators', () => {
  it('like lowers to eql_v2.like with the match-term codec on the value side', () => {
    const op = findOp('like')
    expect(op.lowering.template).toBe('eql_v2.like({{self}}, {{arg0}})')
    expect(op.args[1]?.codecId).toBe(ENCRYPTED_MATCH_TERM_CODEC_ID)
  })

  it('ilike lowers to eql_v2.ilike', () => {
    const op = findOp('ilike')
    expect(op.lowering.template).toBe('eql_v2.ilike({{self}}, {{arg0}})')
    expect(op.args[1]?.codecId).toBe(ENCRYPTED_MATCH_TERM_CODEC_ID)
  })

  it('notIlike wraps eql_v2.ilike in NOT (...)', () => {
    const op = findOp('notIlike')
    expect(op.lowering.template).toBe('NOT (eql_v2.ilike({{self}}, {{arg0}}))')
    expect(op.args[1]?.codecId).toBe(ENCRYPTED_MATCH_TERM_CODEC_ID)
  })
})

describe('JSONB / STE-Vec operators', () => {
  it('jsonbPathExists lowers to eql_v2.jsonb_path_exists with selector cast', () => {
    const op = findOp('jsonbPathExists')
    expect(op.lowering.template).toBe(
      'eql_v2.jsonb_path_exists({{self}}, {{arg0}}::eql_v2_encrypted)',
    )
    expect(op.args[1]?.codecId).toBe(ENCRYPTED_STE_VEC_SELECTOR_CODEC_ID)
    expect(op.returns.codecId).toBe('core/bool@1')
  })

  it('jsonbPathQueryFirst lowers to eql_v2.jsonb_path_query_first and returns encrypted storage', () => {
    const op = findOp('jsonbPathQueryFirst')
    expect(op.lowering.template).toBe(
      'eql_v2.jsonb_path_query_first({{self}}, {{arg0}}::eql_v2_encrypted)',
    )
    expect(op.returns.codecId).toBe(ENCRYPTED_STORAGE_CODEC_ID)
  })

  it('jsonbGet lowers to the -> infix operator with selector cast', () => {
    const op = findOp('jsonbGet')
    expect(op.lowering.template).toBe(
      '({{self}} -> {{arg0}}::eql_v2_encrypted)',
    )
    expect(op.lowering.strategy).toBe('infix')
    expect(op.returns.codecId).toBe(ENCRYPTED_STORAGE_CODEC_ID)
  })
})
