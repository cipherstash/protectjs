import { Encryption, type EncryptionClient } from '@/encryption'
import type {
  EncryptedColumn,
  EncryptedTable,
  EncryptedTableColumn,
} from '@/schema'
import type { EncryptedDataType } from './constants'
import { CipherStashCodecError } from './errors'

/**
 * Per-extension `EncryptionClient` resolution.
 *
 * Each `cipherstashEncryption({ encryptionClient?, contract })` call
 * produces a fresh extension descriptor with its own client + schemas
 * captured in closure. There is no module-level singleton: two
 * extensions live side-by-side without cross-talk, and multi-tenant
 * deployments construct one extension per tenant.
 *
 * The schemas come from the user's contract via `extractEncryptedSchemas`.
 * The codec dispatches by the value's JS-runtime data type at encode
 * time, picking the first contract column that matches that data type.
 *
 * Upstream gap (documented in audit F-10/F-30): Prisma Next's
 * `encodeParam` / `decodeRow` do not surface column metadata to
 * `codec.encode` / `codec.decode`. We approximate by JS-runtime
 * dispatch on the contract's columns; users with a single encrypted
 * column per data type get correct behaviour. Multi-column-per-dataType
 * contracts encrypt every value of that data type under the *first*
 * matching column's index configuration. Track upstream concurrency /
 * column-context plumbing under TML-2330; until then this is the best
 * we can do without per-column codec instances.
 */

/**
 * Resolved per-extension client binding. Carries the lazy client
 * Promise plus the contract-derived index for JS-runtime dispatch.
 */
export type CipherStashEncryptionBinding = {
  /**
   * Resolve the active `EncryptionClient`. Cheap on the hot path: a
   * single map lookup once initialization has resolved.
   */
  readonly getClient: () => Promise<EncryptionClient>
  /**
   * Pick a `(table, column)` pair from the contract for a JS-runtime
   * data type. Returns `null` when the contract has no encrypted
   * column matching the data type — callers throw a
   * `NO_COLUMN_FOR_DATATYPE` `CipherStashCodecError` in that case so
   * the user sees an actionable message.
   */
  readonly resolveColumnFor: (
    dataType: EncryptedDataType,
  ) => ColumnBinding | null
}

export type ColumnBinding = {
  readonly table: EncryptedTable<EncryptedTableColumn>
  readonly column: EncryptedColumn
  /**
   * Stable column name on the underlying Postgres table. Surfaced on
   * structured events (`onEvent({ table, column })`) so observability
   * sees real column names, not synthetic ones.
   */
  readonly columnName: string
}

/**
 * Build a `(dataType -> ColumnBinding)` index from the contract's
 * extracted schemas. The first encrypted column matching each data
 * type wins; ties are broken by table iteration order (the contract's
 * declared order).
 */
function indexSchemasByDataType(
  schemas: ReadonlyArray<EncryptedTable<EncryptedTableColumn>>,
): ReadonlyMap<EncryptedDataType, ColumnBinding> {
  const index = new Map<EncryptedDataType, ColumnBinding>()
  for (const table of schemas) {
    const built = table.build()
    for (const [columnName, columnSchema] of Object.entries(built.columns)) {
      const castAs = columnSchema.cast_as
      const dataType = dataTypeFromCastAs(castAs)
      if (!dataType) continue
      if (index.has(dataType)) continue
      const columnBuilder = (table as unknown as Record<string, unknown>)[
        columnName
      ]
      if (!isEncryptedColumnBuilder(columnBuilder)) continue
      index.set(dataType, {
        table,
        column: columnBuilder,
        columnName,
      })
    }
  }
  return index
}

function dataTypeFromCastAs(castAs: string): EncryptedDataType | null {
  switch (castAs) {
    case 'string':
    case 'text':
      return 'string'
    case 'number':
    case 'double':
    case 'real':
    case 'int':
    case 'small_int':
    case 'big_int':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'date':
      return 'date'
    case 'json':
    case 'jsonb':
      return 'json'
    default:
      return null
  }
}

function isEncryptedColumnBuilder(value: unknown): value is EncryptedColumn {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { getName?: unknown; build?: unknown }
  return (
    typeof candidate.getName === 'function' &&
    typeof candidate.build === 'function'
  )
}

/**
 * Required env vars when constructing a default client. Validated
 * synchronously at extension construction time so misconfiguration
 * surfaces in the dev-server boot log, not deep inside a codec call.
 */
export const REQUIRED_ENV_VARS = [
  'CS_WORKSPACE_CRN',
  'CS_CLIENT_ID',
  'CS_CLIENT_KEY',
] as const

export type RequiredEnvVar = (typeof REQUIRED_ENV_VARS)[number]

/**
 * Throw a structured `CipherStashCodecError` listing every missing
 * env var on a single line. Includes a pointer to the README anchor
 * so the user can self-serve.
 */
function assertEnvIsConfigured(): void {
  const missing: RequiredEnvVar[] = []
  for (const name of REQUIRED_ENV_VARS) {
    if (!process.env[name]) missing.push(name)
  }
  if (missing.length === 0) return
  throw new CipherStashCodecError({
    code: 'CONFIG_MISSING_ENV',
    message: `cipherstashEncryption() requires the following environment variables: ${missing.join(', ')}. Either set them in your environment, or pass a pre-constructed EncryptionClient: cipherstashEncryption({ encryptionClient }). See packages/stack/src/prisma/README.md#setup for details.`,
    column: undefined,
    expectedDataType: undefined,
    actualType: 'missing',
  })
}

/**
 * Construct a per-extension binding.
 *
 *   - When `encryptionClient` is supplied, use it verbatim. Schema
 *     registration is the caller's responsibility — the binding still
 *     reads the contract-derived index so the codecs route real
 *     `(table, column)` pairs through to the FFI.
 *   - When `encryptionClient` is omitted, validate the required env
 *     vars synchronously and lazy-construct a default client on first
 *     encrypt/decrypt. The lazy promise is cached per binding so
 *     concurrent callers share a single in-flight initialization;
 *     a failure clears the cache so subsequent calls retry.
 */
export function createEncryptionBinding(opts: {
  readonly client?: EncryptionClient
  readonly schemas: ReadonlyArray<EncryptedTable<EncryptedTableColumn>>
}): CipherStashEncryptionBinding {
  const { client: providedClient, schemas } = opts
  const columnIndex = indexSchemasByDataType(schemas)

  let pending: Promise<EncryptionClient> | undefined

  if (!providedClient) {
    // Eager env validation (F-5). When the caller supplies a client,
    // they are responsible for its credentials — we don't second-guess
    // them.
    assertEnvIsConfigured()
  }

  const getClient = async (): Promise<EncryptionClient> => {
    if (providedClient) return providedClient
    if (pending) return pending
    if (schemas.length === 0) {
      throw new CipherStashCodecError({
        code: 'NO_CONTRACT_SCHEMAS',
        message:
          'cipherstashEncryption() was constructed without `encryptionClient` and the contract declared no encrypted columns. Provide a contract with at least one `encrypted*({...})` column, or pass a pre-constructed `encryptionClient`. See packages/stack/src/prisma/README.md#setup for details.',
        column: undefined,
        expectedDataType: undefined,
        actualType: 'no-schemas',
      })
    }
    const schemaList = schemas as ReadonlyArray<
      EncryptedTable<EncryptedTableColumn>
    >
    pending = Encryption({
      schemas: schemaList as unknown as [
        EncryptedTable<EncryptedTableColumn>,
        ...EncryptedTable<EncryptedTableColumn>[],
      ],
    }).catch((error: unknown) => {
      // Clear the cache on failure so the next call retries; otherwise
      // a transient network failure during boot poisons every encode
      // for the lifetime of the process.
      pending = undefined
      throw error
    })
    return pending
  }

  const resolveColumnFor = (
    dataType: EncryptedDataType,
  ): ColumnBinding | null => columnIndex.get(dataType) ?? null

  return { getClient, resolveColumnFor }
}

/**
 * Helper for codec call sites that need both the binding and a
 * resolved `ColumnBinding`. Surfaces a structured error when the
 * contract has no encrypted column matching the JS-runtime data type.
 */
export function requireColumnFor(
  binding: CipherStashEncryptionBinding,
  dataType: EncryptedDataType,
  hint: { readonly codecLabel: string; readonly value: unknown },
): ColumnBinding {
  const column = binding.resolveColumnFor(dataType)
  if (column) return column
  throw new CipherStashCodecError({
    code: 'NO_COLUMN_FOR_DATATYPE',
    message: `${hint.codecLabel}: contract has no encrypted column with dataType '${dataType}'. Add an encrypted column of that type to the contract, or use a column type that matches the value (got JS type '${describeJs(hint.value)}').`,
    column: undefined,
    expectedDataType: dataType,
    actualType: describeJs(hint.value),
  })
}

function describeJs(value: unknown): string {
  if (value === null) return 'null'
  if (value instanceof Date) return 'Date'
  if (Array.isArray(value)) return 'array'
  return typeof value
}
