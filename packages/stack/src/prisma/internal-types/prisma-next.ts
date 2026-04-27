/**
 * Vendored type shapes from `@prisma-next/*` packages.
 *
 * Prisma Next is pre-publish on npm at the time of writing. This module
 * mirrors the minimal surface of the post-#379 (single-path async codec
 * runtime) public types so `@cipherstash/stack/prisma` can build and
 * type-check independently of a forked Prisma Next checkout. It is replaced
 * by real peer-dependency imports once Prisma Next ships to npm.
 *
 * The shapes here track:
 *   - `@prisma-next/framework-components/codec`
 *   - `@prisma-next/sql-relational-core/ast`
 *   - `@prisma-next/sql-runtime`
 *   - `@prisma-next/family-sql/control`
 *   - `@prisma-next/sql-operations`
 *   - `@prisma-next/contract-authoring`
 *
 * They are intentionally narrow: only the fields our integration produces or
 * consumes are vendored. Promoting to real imports is mechanical (rename and
 * delete this file). See `notes/cipherstash-prisma-integration-plan-v2.md`
 * for the full mapping.
 */

// ---------------------------------------------------------------------------
// JSON values (mirrors @prisma-next/contract/types)
// ---------------------------------------------------------------------------

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }

// ---------------------------------------------------------------------------
// Codec contract (mirrors @prisma-next/framework-components/codec)
// ---------------------------------------------------------------------------

export type CodecTrait =
  | 'equality'
  | 'order'
  | 'boolean'
  | 'numeric'
  | 'textual'

/**
 * Boundary contract: `encode` / `decode` are always Promise-returning even
 * when authored synchronously. The factory in `@prisma-next/sql-relational-core/ast`
 * lifts sync authors to async at construction time.
 */
export interface BaseCodec<
  Id extends string = string,
  TTraits extends readonly CodecTrait[] = readonly CodecTrait[],
  TWire = unknown,
  TInput = unknown,
> {
  readonly id: Id
  readonly targetTypes: readonly string[]
  readonly traits?: TTraits
  encode(value: TInput): Promise<TWire>
  decode(wire: TWire): Promise<TInput>
  encodeJson(value: TInput): JsonValue
  decodeJson(json: JsonValue): TInput
  renderOutputType?(typeParams: Record<string, unknown>): string | undefined
}

// ---------------------------------------------------------------------------
// SQL codec (mirrors @prisma-next/sql-relational-core/ast)
// ---------------------------------------------------------------------------

/**
 * SQL codec metadata is pulled into the codec object so the migration
 * planner can introspect native types without re-deriving them from
 * descriptors elsewhere.
 */
export interface CodecMeta {
  readonly db?: {
    readonly sql?: {
      readonly postgres?: {
        readonly nativeType: string
      }
    }
  }
}

/**
 * Arktype `Type` is exposed as an opaque generic on the SQL codec interface
 * so we don't take a hard dependency on arktype's full surface here.
 * Runtime descriptors construct real arktype values inside `exports/runtime.ts`.
 */
export type ArkSchema<TParams> = {
  readonly __params?: TParams
  // Arktype's Type<T> is a callable that returns either the validated value
  // or an error; we don't model that here. Treating it as an opaque token is
  // sufficient for the build-time / type-only surface we use.
  readonly inferIn?: TParams
}

export interface SqlCodec<
  Id extends string = string,
  TTraits extends readonly CodecTrait[] = readonly CodecTrait[],
  TWire = unknown,
  TInput = unknown,
  TParams = Record<string, unknown>,
  THelper = unknown,
> extends BaseCodec<Id, TTraits, TWire, TInput> {
  readonly meta?: CodecMeta
  readonly paramsSchema?: ArkSchema<TParams>
  readonly init?: (params: TParams) => THelper
}

/**
 * Runtime registry. Phase 1 only uses `register` and (via the runtime
 * extension `codecs()` factory) iteration; we keep the surface narrow.
 */
export interface CodecRegistry {
  get(id: string): SqlCodec | undefined
  has(id: string): boolean
  register(codec: SqlCodec): void
  hasTrait(codecId: string, trait: CodecTrait): boolean
  traitsOf(codecId: string): readonly CodecTrait[]
  values(): IterableIterator<SqlCodec>
  [Symbol.iterator](): Iterator<SqlCodec>
}

// ---------------------------------------------------------------------------
// Operations (mirrors @prisma-next/operations + @prisma-next/sql-operations)
// ---------------------------------------------------------------------------

export interface ParamSpec {
  readonly codecId?: string
  readonly traits?: readonly string[]
  readonly nullable: boolean
}

export interface ReturnSpec {
  readonly codecId: string
  readonly nullable: boolean
}

export interface SqlLoweringSpec {
  readonly targetFamily: 'sql'
  readonly strategy: 'infix' | 'function'
  readonly template: string
}

export interface SqlOperationEntry {
  readonly args: readonly ParamSpec[]
  readonly returns: ReturnSpec
  readonly lowering: SqlLoweringSpec
}

export type SqlOperationDescriptor = SqlOperationEntry & {
  readonly method: string
}

// ---------------------------------------------------------------------------
// Contract authoring (mirrors @prisma-next/contract-authoring)
// ---------------------------------------------------------------------------

export type ColumnTypeDescriptor<TCodecId extends string = string> = {
  readonly codecId: TCodecId
  readonly nativeType: string
  readonly typeParams?: Record<string, unknown>
  readonly typeRef?: string
}

// ---------------------------------------------------------------------------
// Runtime extension descriptor (mirrors @prisma-next/sql-runtime)
// ---------------------------------------------------------------------------

export interface RuntimeParameterizedCodecDescriptor<
  TParams = Record<string, unknown>,
  THelper = unknown,
> {
  readonly codecId: string
  readonly paramsSchema: ArkSchema<TParams>
  readonly init?: (params: TParams) => THelper
}

export interface SqlRuntimeExtensionInstance<TTargetId extends string> {
  readonly familyId: 'sql'
  readonly targetId: TTargetId
}

export interface SqlRuntimeExtensionDescriptor<
  TTargetId extends string = string,
> {
  readonly kind: 'extension'
  readonly id: string
  readonly version: string
  readonly familyId: 'sql'
  readonly targetId: TTargetId
  readonly codecs: () => CodecRegistry
  readonly queryOperations?: () => readonly SqlOperationDescriptor[]
  readonly parameterizedCodecs?: () => readonly RuntimeParameterizedCodecDescriptor[]
  create(): SqlRuntimeExtensionInstance<TTargetId>
}

// ---------------------------------------------------------------------------
// Control extension descriptor (mirrors @prisma-next/family-sql/control)
// ---------------------------------------------------------------------------

/**
 * SQL DDL step shape used inside `databaseDependencies.init` and
 * `planTypeOperations` results. Mirrors `SqlMigrationPlanOperationStep`
 * in `@prisma-next/family-sql/control`.
 */
export interface SqlMigrationStep {
  readonly description: string
  readonly sql: string
  readonly meta?: Readonly<Record<string, unknown>>
}

/**
 * Operation classification used by the migration planner to distinguish
 * additive (safe) DDL from destructive (data-losing) DDL. We declare the
 * union here for shape-fidelity with the upstream type; phase-3 emit
 * sites only use `'additive'` and `'destructive'`.
 */
export type MigrationOperationClass = 'additive' | 'destructive' | 'widening'

/**
 * Single SQL operation: install / drop / alter. The `target` payload's
 * `details` field carries target-specific data (Postgres uses `objectType`
 * + optional `table`). Phase 3 leaves `details` minimal to avoid
 * pinning to a specific upstream target shape; the migration planner
 * accepts any structurally-compatible payload.
 */
export interface SqlMigrationPlanOperation {
  readonly id: string
  readonly label: string
  readonly summary?: string
  readonly operationClass: MigrationOperationClass
  readonly target: {
    readonly id: string
    readonly details?: Record<string, unknown>
  }
  readonly precheck: readonly SqlMigrationStep[]
  readonly execute: readonly SqlMigrationStep[]
  readonly postcheck: readonly SqlMigrationStep[]
  readonly meta?: Readonly<Record<string, unknown>>
}

/**
 * `databaseDependencies.init` entry: a labeled bundle of `install`
 * operations, run together when the extension first attaches to a
 * database. Pgvector ships one entry that creates the `vector`
 * extension; we ship one that runs the EQL install bundle.
 */
export interface ComponentDatabaseDependency {
  readonly id: string
  readonly label: string
  readonly install: readonly SqlMigrationPlanOperation[]
}

export interface ComponentDatabaseDependencies<TUpgradeContext = unknown> {
  readonly init?: readonly ComponentDatabaseDependency[]
  /**
   * Phase 4 hook for `databaseDependencies.upgrade(fromVersion, toVersion)`.
   * Phase 3 ships `init` only; the upgrade signature is reserved here
   * so the descriptor's shape doesn't churn between phases.
   */
  readonly upgrade?: (
    fromVersion: string,
    toVersion: string,
    ctx: TUpgradeContext,
  ) => readonly ComponentDatabaseDependency[]
}

/**
 * `StorageTypeInstance` is the post-#379 shape of a named, parameterized
 * type registered in `storage.types`. Each encrypted column in the
 * contract surfaces here with `codecId: 'cs/eql_v2_encrypted@1'`,
 * `nativeType: '"public"."eql_v2_encrypted"'`, and `typeParams` carrying
 * the search-mode flags.
 */
export interface StorageTypeInstance {
  readonly codecId: string
  readonly nativeType: string
  readonly typeParams: Record<string, unknown>
}

/**
 * Result of a `planTypeOperations` call: a flat list of DDL operations
 * the migration planner appends to its plan. Returning an empty
 * `operations` array is a no-op.
 */
export interface StorageTypePlanResult {
  readonly operations: readonly SqlMigrationPlanOperation[]
}

/**
 * Plan-time context the migration planner passes to `planTypeOperations`.
 * Phase 3 only needs `typeName`, `typeInstance`, and the schema
 * identifier — the contract / schema IR / policy fields are reserved for
 * Phase 4 destructive-change reasoning.
 */
export interface PlanTypeOperationsInput {
  readonly typeName: string
  readonly typeInstance: StorageTypeInstance
  readonly schemaName?: string
  readonly contract?: unknown
  readonly schema?: unknown
  readonly policy?: unknown
}

export interface CodecControlHooks {
  readonly expandNativeType?: (input: {
    readonly nativeType: string
    readonly typeParams: Record<string, unknown> | undefined
  }) => string
  readonly resolveIdentityValue?: (input: {
    readonly typeParams: Record<string, unknown> | undefined
  }) => string | null | undefined
  /**
   * Phase 3 hook: emit per-column EQL index DDL. Called once per
   * `StorageTypeInstance` registered against this codec ID. Implementers
   * inspect `typeInstance.typeParams` to decide which `eql_v2.*` calls
   * to emit; returning an empty `operations` array is a no-op.
   */
  readonly planTypeOperations?: (
    input: PlanTypeOperationsInput,
  ) => StorageTypePlanResult
}

export interface SqlControlExtensionDescriptor<
  TTargetId extends string = string,
> {
  readonly kind: 'extension'
  readonly id: string
  readonly familyId: 'sql'
  readonly targetId: TTargetId
  readonly version: string
  readonly capabilities?: Record<string, Record<string, boolean>>
  readonly types?: {
    readonly codecTypes?: {
      readonly codecInstances?: readonly SqlCodec[]
      readonly controlPlaneHooks?: Record<string, CodecControlHooks>
      readonly import?: {
        readonly package: string
        readonly named: string
        readonly alias?: string
      }
      readonly typeImports?: ReadonlyArray<{
        readonly package: string
        readonly named: string
        readonly alias?: string
      }>
    }
    readonly operationTypes?: {
      readonly import?: {
        readonly package: string
        readonly named: string
        readonly alias?: string
      }
    }
    readonly queryOperationTypes?: {
      readonly import?: {
        readonly package: string
        readonly named: string
        readonly alias?: string
      }
    }
    readonly storage?: ReadonlyArray<{
      readonly typeId: string
      readonly familyId: 'sql'
      readonly targetId: string
      readonly nativeType: string
    }>
  }
  readonly databaseDependencies?: ComponentDatabaseDependencies<unknown>
  readonly queryOperations?: () => readonly SqlOperationDescriptor[]
  create(): { readonly familyId: 'sql'; readonly targetId: TTargetId }
}
