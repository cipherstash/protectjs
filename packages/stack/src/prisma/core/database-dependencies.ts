import type {
  ComponentDatabaseDependencies,
  ComponentDatabaseDependency,
  PlanTypeOperationsInput,
  SqlMigrationPlanOperation,
  StorageTypePlanResult,
} from '../internal-types/prisma-next'
import type { EncryptedDataType } from './constants'
import { getEqlBundleVersion, getEqlInstallSql } from './eql-bundle'

/**
 * `databaseDependencies` and `planTypeOperations` for the CipherStash
 * extension pack.
 *
 * Two responsibilities split across this file:
 *   1. `getCipherStashDatabaseDependencies()` — returns the
 *      `databaseDependencies.init` payload. The migration planner runs
 *      this once when the extension first attaches; subsequent runs
 *      see the EQL configuration tables already present and skip via
 *      the `precheck` SQL.
 *   2. `planEncryptedTypeOperations(input)` — emits per-column EQL
 *      index DDL for one `StorageTypeInstance`. The migration planner
 *      calls this for every encrypted-column type instance whenever
 *      the contract changes.
 */

// ---------------------------------------------------------------------------
// databaseDependencies.init
// ---------------------------------------------------------------------------

/**
 * Magic dependency-bundle ID. Stable across releases so the migration
 * planner can correlate this dependency with previously-applied
 * versions when the upgrade story (Phase 4) lands.
 */
const EQL_DEPENDENCY_ID = 'cipherstash.eql' as const
/**
 * Inner-operation ID. Distinct from `EQL_DEPENDENCY_ID` because a
 * single dependency bundle can hold multiple operations; for the
 * install case we emit exactly one.
 */
const EQL_INSTALL_OPERATION_ID = 'cipherstash.eql.install' as const

/**
 * Build the `databaseDependencies` value for the SQL control
 * descriptor. Pgvector ships `CREATE EXTENSION vector`; we ship the
 * full EQL install bundle (vendored from the pinned release).
 *
 * `precheck` short-circuits the install when EQL is already present
 * (the `eql_v2_configuration` table is created at the head of the
 * bundle and is a stable marker). The `execute` SQL is the bundle
 * itself — Postgres parses it as a multi-statement DO/CREATE block.
 * `postcheck` re-asserts the marker so the migration runner can
 * distinguish "ran but didn't take" from "ran successfully".
 */
export function getCipherStashDatabaseDependencies(): Required<
  Pick<ComponentDatabaseDependencies, 'init'>
> {
  const sql = getEqlInstallSql()
  const version = getEqlBundleVersion()

  const installOperation: SqlMigrationPlanOperation = {
    id: EQL_INSTALL_OPERATION_ID,
    label: 'Install CipherStash EQL extension',
    summary:
      'Installs the `eql_v2` schema, types, configuration tables, and SQL functions required by encrypted columns.',
    operationClass: 'additive',
    target: {
      id: 'postgres',
    },
    precheck: [
      {
        description:
          'Skip the install when the EQL configuration table already exists',
        sql: "SELECT NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'eql_v2_configuration')",
      },
    ],
    execute: [
      {
        description: `Apply the EQL install bundle (version: ${version})`,
        sql,
      },
    ],
    postcheck: [
      {
        description: 'Confirm the EQL configuration table exists after install',
        sql: "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'eql_v2_configuration')",
      },
    ],
    meta: { eqlBundleVersion: version },
  }

  const dependency: ComponentDatabaseDependency = {
    id: EQL_DEPENDENCY_ID,
    label: 'CipherStash EQL extension',
    install: [installOperation],
  }

  return { init: [dependency] }
}

// ---------------------------------------------------------------------------
// planTypeOperations
// ---------------------------------------------------------------------------

/**
 * EQL `add_search_config` index names corresponding to each
 * searchable-encryption flag on a column's typeParams. The planner
 * threads these into one `eql_v2.add_search_config(...)` call per
 * enabled mode.
 */
type SearchMode = 'unique' | 'match' | 'ore' | 'ste_vec'

type SearchModeFlag = {
  readonly mode: SearchMode
  readonly flag:
    | 'equality'
    | 'freeTextSearch'
    | 'orderAndRange'
    | 'searchableJson'
}

/**
 * Order matters for stable diff hashes: every column's `add_search_config`
 * calls land in the same order so the migration planner's plan-content
 * hash doesn't churn for trivial typeParams reorderings.
 */
const SEARCH_MODES: readonly SearchModeFlag[] = [
  { mode: 'unique', flag: 'equality' },
  { mode: 'match', flag: 'freeTextSearch' },
  { mode: 'ore', flag: 'orderAndRange' },
  { mode: 'ste_vec', flag: 'searchableJson' },
]

/**
 * Map our `EncryptedDataType` values to the EQL `cast_as` argument the
 * `add_search_config` function expects. EQL's accepted set is
 * `{text, int, small_int, big_int, real, double, boolean, date, jsonb}`.
 */
function castAsForDataType(dataType: EncryptedDataType): string {
  switch (dataType) {
    case 'string':
      return 'text'
    case 'number':
      return 'double'
    case 'boolean':
      return 'boolean'
    case 'date':
      return 'date'
    case 'json':
      return 'jsonb'
  }
}

/**
 * Type guard for the typeParams shape emitted by our `encrypted*`
 * column factories. The migration planner hands us
 * `Record<string, unknown>`, so we re-derive the searchable-encryption
 * flags from a known-shape projection. Defaults match the column-type
 * factories: every flag false unless declared.
 */
type EncryptedTypeParamsView = {
  readonly dataType: EncryptedDataType
  readonly equality: boolean
  readonly freeTextSearch: boolean
  readonly orderAndRange: boolean
  readonly searchableJson: boolean
}

function projectTypeParams(
  raw: Record<string, unknown>,
): EncryptedTypeParamsView | null {
  const dataType = raw.dataType
  if (
    dataType !== 'string' &&
    dataType !== 'number' &&
    dataType !== 'boolean' &&
    dataType !== 'date' &&
    dataType !== 'json'
  ) {
    return null
  }
  return {
    dataType,
    equality: raw.equality === true,
    freeTextSearch: raw.freeTextSearch === true,
    orderAndRange: raw.orderAndRange === true,
    searchableJson: raw.searchableJson === true,
  }
}

/**
 * Identify (table, column) for a typeInstance. The post-#379 contract
 * model keeps named type instances as keys in `storage.types`, with the
 * key carrying a stable `<table>__<column>` shape *or* a custom name.
 * Phase 3 supports the `<table>__<column>` shape and falls back to the
 * raw typeName when it can't split cleanly. Real Phase 4 work will
 * read `(table, column)` directly off the contract once the planner
 * passes a richer input.
 */
function deriveTableAndColumn(
  typeName: string,
): { table: string; column: string } | null {
  const idx = typeName.lastIndexOf('__')
  if (idx <= 0 || idx >= typeName.length - 2) return null
  const table = typeName.slice(0, idx)
  const column = typeName.slice(idx + 2)
  return { table, column }
}

/**
 * SQL-literal escape for identifiers / values embedded in the
 * `eql_v2.add_search_config(...)` call. We single-quote the text values
 * (`table`, `column`, `index_name`, `cast_as`); the SQL parser treats
 * `''` as an embedded single-quote.
 */
function quoteSqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/**
 * Phase 3 implementation of the `planTypeOperations` codec-control
 * hook.
 *
 * For each encrypted column type instance, emit zero or more
 * `eql_v2.add_search_config(table, column, index_name, cast_as)` calls
 * — one per enabled searchable-encryption flag. The migration planner
 * appends these to the migration plan; on first run they create the
 * EQL search indexes, and the precheck SQL ensures re-running the same
 * plan after adopting the indexes is a no-op.
 *
 * Open questions documented for the upstream Prisma Next team:
 *   - The planner's input shape on the post-#379 trunk doesn't
 *     currently surface `(table, column)` directly to the codec hook.
 *     We derive these from a `<table>__<column>` typeName convention as
 *     a Phase 3 placeholder; Phase 4 should align with a richer planner
 *     input once it lands.
 *   - Removing a search-mode flag (e.g. `equality: true → false`)
 *     should emit `eql_v2.remove_search_config(...)` for the dropped
 *     mode. The current `planTypeOperations` API doesn't carry the
 *     prior-state typeParams, so we can't compute the diff directly.
 *     Phase 4 should consume the `fromContract` planner input once
 *     it's standardized; for now the hook only emits additive
 *     operations.
 */
export function planEncryptedTypeOperations(
  input: PlanTypeOperationsInput,
): StorageTypePlanResult {
  const view = projectTypeParams(input.typeInstance.typeParams)
  if (!view) {
    return { operations: [] }
  }

  const where = deriveTableAndColumn(input.typeName)
  if (!where) {
    // No usable table/column derivation — emit nothing rather than
    // produce a malformed `add_search_config` call. The Phase 4 work
    // documented above will wire this up cleanly.
    return { operations: [] }
  }

  const castAs = castAsForDataType(view.dataType)
  const operations: SqlMigrationPlanOperation[] = []

  for (const { mode, flag } of SEARCH_MODES) {
    if (!view[flag]) continue
    operations.push(
      buildAddSearchConfigOperation({
        table: where.table,
        column: where.column,
        indexName: mode,
        castAs,
      }),
    )
  }

  return { operations }
}

function buildAddSearchConfigOperation(args: {
  table: string
  column: string
  indexName: SearchMode
  castAs: string
}): SqlMigrationPlanOperation {
  const callSql = `SELECT eql_v2.add_search_config(${quoteSqlString(args.table)}, ${quoteSqlString(args.column)}, ${quoteSqlString(args.indexName)}, ${quoteSqlString(args.castAs)})`
  // Skip when the index is already configured. The EQL config payload
  // is JSONB-shaped under `eql_v2_configuration.data` with state
  // `'active' | 'pending'`; a path-exists check keeps the precheck
  // self-contained.
  const precheckSql = `SELECT NOT EXISTS (
    SELECT 1 FROM public.eql_v2_configuration
    WHERE (state = 'active' OR state = 'pending')
      AND data #> ARRAY['tables', ${quoteSqlString(args.table)}, ${quoteSqlString(args.column)}, 'indexes'] ? ${quoteSqlString(args.indexName)}
  )`
  const postcheckSql = `SELECT EXISTS (
    SELECT 1 FROM public.eql_v2_configuration
    WHERE (state = 'active' OR state = 'pending')
      AND data #> ARRAY['tables', ${quoteSqlString(args.table)}, ${quoteSqlString(args.column)}, 'indexes'] ? ${quoteSqlString(args.indexName)}
  )`
  return {
    id: `cipherstash.eql.add_search_config.${args.table}.${args.column}.${args.indexName}`,
    label: `Add EQL ${args.indexName} index on ${args.table}.${args.column}`,
    summary: `Adds the ${args.indexName} EQL search index on ${args.table}.${args.column} (cast_as: ${args.castAs}).`,
    operationClass: 'additive',
    target: {
      id: 'postgres',
      details: {
        objectType: 'table',
        schema: 'public',
        table: args.table,
        column: args.column,
        indexName: args.indexName,
      },
    },
    precheck: [
      {
        description: 'Skip when the index is already configured',
        sql: precheckSql,
      },
    ],
    execute: [{ description: callSql, sql: callSql }],
    postcheck: [
      { description: 'Confirm the index is now configured', sql: postcheckSql },
    ],
    meta: { kind: 'add_search_config', indexName: args.indexName },
  }
}
