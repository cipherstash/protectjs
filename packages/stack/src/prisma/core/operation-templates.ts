import type { SqlOperationDescriptor } from '../internal-types/prisma-next'
import {
  ENCRYPTED_EQ_TERM_CODEC_ID,
  ENCRYPTED_MATCH_TERM_CODEC_ID,
  ENCRYPTED_ORE_TERM_CODEC_ID,
  ENCRYPTED_STE_VEC_SELECTOR_CODEC_ID,
  ENCRYPTED_STORAGE_CODEC_ID,
} from './constants'

/**
 * Boolean return spec used by every encrypted comparison operation.
 *
 * Lowering produces a SQL function call that returns Postgres `boolean`,
 * so the runtime registry needs a codec ID for `boolean`. The framework
 * registers a default boolean codec under `core/bool@1`; we reference it
 * by ID here without taking a peer-dep on the package that defines it.
 * This is the same pattern pgvector uses (`pg/float8@1`) for its return
 * codec without importing it.
 */
const RETURN_BOOL = {
  codecId: 'core/bool@1',
  nullable: false,
} as const

/**
 * Storage-codec self-reference (`{{self}}`) — the column being filtered.
 * Always non-null at this site because the operator is invoked on a column
 * accessor, not a free-standing expression.
 */
const SELF_STORAGE = {
  codecId: ENCRYPTED_STORAGE_CODEC_ID,
  nullable: false,
} as const

/**
 * Storage-codec return spec used by `jsonbGet` / `jsonbPathQueryFirst`.
 * These operators return an `eql_v2_encrypted` value (the encrypted JSON
 * sub-document), which the storage codec will decode to a JS value on
 * read.
 */
const RETURN_STORAGE = {
  codecId: ENCRYPTED_STORAGE_CODEC_ID,
  nullable: true,
} as const

/**
 * Custom comparison operations for encrypted columns.
 *
 * Each operator pins a *value-side* codec via `args[1].codecId` so the
 * single plaintext literal supplied to the user-facing method (`.eq(x)` /
 * `.gte(x)` / `.like(x)` / etc.) encrypts as the right query-term shape
 * for the underlying EQL function. The lowering template substitutes
 * `{{self}}` for the column reference and `{{argN}}` for the user-side
 * arguments (i.e. positional: `args[N+1]` of the descriptor — `args[0]`
 * is `self`).
 *
 * Why we lower to `eql_v2.<op>(...)` SQL functions instead of native SQL
 * operators: EQL ciphers contain randomized nonces / IVs, so two encrypts
 * of the same plaintext do not byte-equal under SQL `=`. The dedicated
 * EQL functions short-circuit to the appropriate index (HMAC for
 * equality, ORE blocks for range, bloom filter for match, STE-vec for
 * jsonb selectors) and produce correct results in every case. This is
 * the entire reason we diverge from pgvector's "native operator with
 * codec coercion" pattern.
 *
 * Operator-to-EQL-function map verified against
 * `packages/stack/src/drizzle/operators.ts` (the source of truth for EQL
 * call shapes).
 */
export const encryptedQueryOperations: readonly SqlOperationDescriptor[] = [
  // ---------------------------------------------------------------------
  // Equality (gated at the column-type level on `typeParams.equality`).
  // ---------------------------------------------------------------------
  {
    method: 'eq',
    args: [
      SELF_STORAGE,
      { codecId: ENCRYPTED_EQ_TERM_CODEC_ID, nullable: false },
    ],
    returns: RETURN_BOOL,
    lowering: {
      targetFamily: 'sql',
      strategy: 'function',
      template: 'eql_v2.eq({{self}}, {{arg0}})',
    },
  },
  {
    method: 'neq',
    args: [
      SELF_STORAGE,
      { codecId: ENCRYPTED_EQ_TERM_CODEC_ID, nullable: false },
    ],
    returns: RETURN_BOOL,
    lowering: {
      targetFamily: 'sql',
      strategy: 'function',
      template: 'eql_v2.neq({{self}}, {{arg0}})',
    },
  },

  // ---------------------------------------------------------------------
  // Range / order (gated on `typeParams.orderAndRange`). Drizzle
  // implementation: `sql\`eql_v2.gt(${left}, ${bindIfParam(right)})\`` etc.
  // ---------------------------------------------------------------------
  {
    method: 'gt',
    args: [
      SELF_STORAGE,
      { codecId: ENCRYPTED_ORE_TERM_CODEC_ID, nullable: false },
    ],
    returns: RETURN_BOOL,
    lowering: {
      targetFamily: 'sql',
      strategy: 'function',
      template: 'eql_v2.gt({{self}}, {{arg0}})',
    },
  },
  {
    method: 'gte',
    args: [
      SELF_STORAGE,
      { codecId: ENCRYPTED_ORE_TERM_CODEC_ID, nullable: false },
    ],
    returns: RETURN_BOOL,
    lowering: {
      targetFamily: 'sql',
      strategy: 'function',
      template: 'eql_v2.gte({{self}}, {{arg0}})',
    },
  },
  {
    method: 'lt',
    args: [
      SELF_STORAGE,
      { codecId: ENCRYPTED_ORE_TERM_CODEC_ID, nullable: false },
    ],
    returns: RETURN_BOOL,
    lowering: {
      targetFamily: 'sql',
      strategy: 'function',
      template: 'eql_v2.lt({{self}}, {{arg0}})',
    },
  },
  {
    method: 'lte',
    args: [
      SELF_STORAGE,
      { codecId: ENCRYPTED_ORE_TERM_CODEC_ID, nullable: false },
    ],
    returns: RETURN_BOOL,
    lowering: {
      targetFamily: 'sql',
      strategy: 'function',
      template: 'eql_v2.lte({{self}}, {{arg0}})',
    },
  },
  // `between` and `notBetween` mirror Drizzle's lowering:
  //   eql_v2.gte(self, min) AND eql_v2.lte(self, max)
  // notBetween wraps the above in `NOT (...)`.
  {
    method: 'between',
    args: [
      SELF_STORAGE,
      { codecId: ENCRYPTED_ORE_TERM_CODEC_ID, nullable: false },
      { codecId: ENCRYPTED_ORE_TERM_CODEC_ID, nullable: false },
    ],
    returns: RETURN_BOOL,
    lowering: {
      targetFamily: 'sql',
      strategy: 'function',
      template:
        '(eql_v2.gte({{self}}, {{arg0}}) AND eql_v2.lte({{self}}, {{arg1}}))',
    },
  },
  {
    method: 'notBetween',
    args: [
      SELF_STORAGE,
      { codecId: ENCRYPTED_ORE_TERM_CODEC_ID, nullable: false },
      { codecId: ENCRYPTED_ORE_TERM_CODEC_ID, nullable: false },
    ],
    returns: RETURN_BOOL,
    lowering: {
      targetFamily: 'sql',
      strategy: 'function',
      template:
        'NOT (eql_v2.gte({{self}}, {{arg0}}) AND eql_v2.lte({{self}}, {{arg1}}))',
    },
  },

  // ---------------------------------------------------------------------
  // Free-text search (gated on `typeParams.freeTextSearch`). Drizzle
  // implementation: `sql\`eql_v2.${operator}(${left}, ${bindIfParam(right)})\``.
  // For `notIlike` Drizzle wraps `eql_v2.ilike(...)` in `NOT (...)` — there
  // is no separate `eql_v2.not_ilike` SQL function.
  // ---------------------------------------------------------------------
  {
    method: 'like',
    args: [
      SELF_STORAGE,
      { codecId: ENCRYPTED_MATCH_TERM_CODEC_ID, nullable: false },
    ],
    returns: RETURN_BOOL,
    lowering: {
      targetFamily: 'sql',
      strategy: 'function',
      template: 'eql_v2.like({{self}}, {{arg0}})',
    },
  },
  {
    method: 'ilike',
    args: [
      SELF_STORAGE,
      { codecId: ENCRYPTED_MATCH_TERM_CODEC_ID, nullable: false },
    ],
    returns: RETURN_BOOL,
    lowering: {
      targetFamily: 'sql',
      strategy: 'function',
      template: 'eql_v2.ilike({{self}}, {{arg0}})',
    },
  },
  {
    method: 'notIlike',
    args: [
      SELF_STORAGE,
      { codecId: ENCRYPTED_MATCH_TERM_CODEC_ID, nullable: false },
    ],
    returns: RETURN_BOOL,
    lowering: {
      targetFamily: 'sql',
      strategy: 'function',
      template: 'NOT (eql_v2.ilike({{self}}, {{arg0}}))',
    },
  },

  // ---------------------------------------------------------------------
  // JSONB / STE-Vec (gated on `typeParams.searchableJson`). Selectors
  // encrypt as STE-vec query terms and cast to `eql_v2_encrypted` at the
  // call site, mirroring Drizzle's lowering.
  // ---------------------------------------------------------------------
  {
    method: 'jsonbPathExists',
    args: [
      SELF_STORAGE,
      { codecId: ENCRYPTED_STE_VEC_SELECTOR_CODEC_ID, nullable: false },
    ],
    returns: RETURN_BOOL,
    lowering: {
      targetFamily: 'sql',
      strategy: 'function',
      template:
        'eql_v2.jsonb_path_exists({{self}}, {{arg0}}::eql_v2_encrypted)',
    },
  },
  {
    method: 'jsonbPathQueryFirst',
    args: [
      SELF_STORAGE,
      { codecId: ENCRYPTED_STE_VEC_SELECTOR_CODEC_ID, nullable: false },
    ],
    returns: RETURN_STORAGE,
    lowering: {
      targetFamily: 'sql',
      strategy: 'function',
      template:
        'eql_v2.jsonb_path_query_first({{self}}, {{arg0}}::eql_v2_encrypted)',
    },
  },
  {
    method: 'jsonbGet',
    args: [
      SELF_STORAGE,
      { codecId: ENCRYPTED_STE_VEC_SELECTOR_CODEC_ID, nullable: false },
    ],
    returns: RETURN_STORAGE,
    lowering: {
      targetFamily: 'sql',
      // `->` is a SQL infix operator. Drizzle emits the same shape:
      //   ${left} -> ${selector}::eql_v2_encrypted
      strategy: 'infix',
      template: '({{self}} -> {{arg0}}::eql_v2_encrypted)',
    },
  },

  // ---------------------------------------------------------------------
  // Order-by helpers — explicitly DEFERRED in Phase 2.
  //
  // Drizzle wraps `asc(sql\`eql_v2.order_by(${col})\`)` / `desc(...)`. The
  // Prisma Next public surface for fluent column-side `.order().asc()` /
  // `.desc()` and for SQL `ORDER BY`-time function wrapping is still
  // unstable in the post-#379 type/control plane. Until that surface
  // settles, users can fall back to a raw SQL fragment via
  // `sqlExpression\`eql_v2.order_by(${col}) DESC\``. We'll revisit when
  // the Prisma Next ORM exposes a clean fluent-order seam (TML-2330 is
  // adjacent but not the same; the order-by surface is its own roadmap
  // item).
  // ---------------------------------------------------------------------

  // ---------------------------------------------------------------------
  // `inArray` — DEFERRED (no dedicated `eql_v2.in_array` function exists
  // in EQL). Drizzle composes it as `OR`-ed `eql_v2.eq(...)` calls; the
  // current Prisma Next operator-template lowering expects a single
  // template string with positional arguments and doesn't support
  // variadic OR-fold lowerings. Reopen if EQL gains a function or the
  // framework gains list-aware lowering.
  // ---------------------------------------------------------------------
]
