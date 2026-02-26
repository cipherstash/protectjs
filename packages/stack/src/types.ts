import type {
  ContractColumnRef,
  ContractTableRef,
  ColumnConfig,
  TableColumns,
  AnyResolvedContract,
} from '@/contract'
import type {
  EncryptedColumn,
  EncryptedTable,
  EncryptedTableColumn,
  EncryptedField,
} from '@/schema'
import type {
  Encrypted as CipherStashEncrypted,
  JsPlaintext,
  QueryOpName,
  newClient,
} from '@cipherstash/protect-ffi'

// ---------------------------------------------------------------------------
// Branded type utilities
// ---------------------------------------------------------------------------

/** Brand symbol for nominal typing */
declare const __brand: unique symbol

/** Creates a branded type that is structurally incompatible with the base type */
type Brand<T, B extends string> = T & { readonly [__brand]: B }

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export type Client = Awaited<ReturnType<typeof newClient>> | undefined

/** A branded type representing encrypted data. Cannot be accidentally used as plaintext. */
export type EncryptedValue = Brand<CipherStashEncrypted, 'encrypted'>

/** Structural type representing encrypted data. See also `EncryptedValue` for branded nominal typing. */
export type Encrypted = CipherStashEncrypted

// ---------------------------------------------------------------------------
// Client configuration
// ---------------------------------------------------------------------------

export type KeysetIdentifier = { name: string } | { id: string }

export type ClientConfig = {
  /**
   * The CipherStash workspace CRN (Cloud Resource Name).
   * Format: `crn:<region>.aws:<workspace-id>`.
   * Can also be set via the `CS_WORKSPACE_CRN` environment variable.
   * If omitted, the SDK reads from the environment or TOML config files.
   */
  workspaceCrn?: string

  /**
   * The API access key used for authenticating with the CipherStash API.
   * Can also be set via the `CS_CLIENT_ACCESS_KEY` environment variable.
   * Obtain this from the CipherStash dashboard after creating a workspace.
   */
  accessKey?: string

  /**
   * The client identifier used to authenticate with CipherStash services.
   * Can also be set via the `CS_CLIENT_ID` environment variable.
   * Generated during workspace onboarding in the CipherStash dashboard.
   */
  clientId?: string

  /**
   * The client key material used in combination with ZeroKMS for encryption operations.
   * Can also be set via the `CS_CLIENT_KEY` environment variable.
   * Generated during workspace onboarding in the CipherStash dashboard.
   */
  clientKey?: string

  /**
   * An optional keyset identifier for multi-tenant encryption.
   * Each keyset provides cryptographic isolation, giving each tenant its own keyspace.
   * Specify by name (`{ name: "tenant-a" }`) or UUID (`{ id: "..." }`).
   * Keysets are created and managed in the CipherStash dashboard.
   */
  keyset?: KeysetIdentifier
}

export type EncryptionClientConfig = {
  contract: AnyResolvedContract
  config?: ClientConfig
}

// ---------------------------------------------------------------------------
// Encrypt / decrypt operation options and results
// ---------------------------------------------------------------------------

/**
 * Options for single-value encrypt operations using a contract column reference.
 */
export type EncryptOptions = {
  contract: ContractColumnRef
}

/** Format for encrypted query/search term return values */
export type EncryptedReturnType =
  | 'eql'
  | 'composite-literal'
  | 'escaped-composite-literal'

export type SearchTerm = {
  value: JsPlaintext
  contract: ContractColumnRef
  returnType?: EncryptedReturnType
}

/** Encrypted search term result: EQL object or composite literal string */
export type EncryptedSearchTerm = Encrypted | string

/** Result of encryptQuery (single or batch): EQL or composite literal string */
export type EncryptedQueryResult = Encrypted | string

// ---------------------------------------------------------------------------
// Model field types (encrypted vs decrypted views)
// ---------------------------------------------------------------------------

export type EncryptedFields<T> = {
  [K in keyof T as NonNullable<T[K]> extends Encrypted ? K : never]: T[K]
}

export type OtherFields<T> = {
  [K in keyof T as NonNullable<T[K]> extends Encrypted ? never : K]: T[K]
}

export type DecryptedFields<T> = {
  [K in keyof T as NonNullable<T[K]> extends Encrypted ? K : never]:
    null extends T[K] ? string | null : string
}

/** Model with encrypted fields replaced by plaintext (decrypted) values */
export type Decrypted<T> = OtherFields<T> & DecryptedFields<T>

/**
 * Maps a plaintext model type to its encrypted form using the contract column definitions.
 *
 * Fields whose keys match columns defined in `C` (leaf {@link ColumnConfig} nodes)
 * become `Encrypted`; all other fields retain their original types from `T`.
 *
 * When `C` is the widened `TableColumns` (e.g. when a user passes an explicit
 * `<User>` type argument without specifying `C`), the type degrades gracefully
 * to `T` — preserving backward compatibility.
 */
export type EncryptedFromContract<T, C extends TableColumns> = {
  [K in keyof T]: [K] extends [keyof C]
    ? [C[K & keyof C]] extends [ColumnConfig]
      ? null extends T[K] ? Encrypted | null : Encrypted
      : T[K]
    : T[K]
}

// ---------------------------------------------------------------------------
// Bulk operations
// ---------------------------------------------------------------------------

export type BulkEncryptPayload = Array<{
  id?: string
  plaintext: JsPlaintext
}>

export type BulkEncryptedData = Array<{ id?: string; data: Encrypted }>
export type BulkDecryptPayload = Array<{ id?: string; data: Encrypted }>
export type BulkDecryptedData = Array<DecryptionResult<JsPlaintext>>

type DecryptionSuccess<T> = { error?: never; data: T; id?: string }
type DecryptionError<T> = { error: T; id?: string; data?: never }

/**
 * Result type for individual items in bulk decrypt operations.
 * Uses `error`/`data` fields (not `failure`/`data`) since bulk operations
 * can have per-item failures.
 */
export type DecryptionResult<T> = DecryptionSuccess<T> | DecryptionError<T>

// ---------------------------------------------------------------------------
// Query types (for searchable encryption / encryptQuery)
// ---------------------------------------------------------------------------

/**
 * User-facing query type names for encrypting query values.
 *
 * - `'equality'`: Exact match. [Exact Queries](https://cipherstash.com/docs/platform/searchable-encryption/supported-queries/exact)
 * - `'freeTextSearch'`: Text search. [Match Queries](https://cipherstash.com/docs/platform/searchable-encryption/supported-queries/match)
 * - `'orderAndRange'`: Comparison and range. [Range Queries](https://cipherstash.com/docs/platform/searchable-encryption/supported-queries/range)
 * - `'steVecSelector'`: JSONPath selector (e.g. `'$.user.email'`)
 * - `'steVecTerm'`: Containment (e.g. `{ role: 'admin' }`)
 * - `'searchableJson'`: Auto-infers selector or term from plaintext type (recommended)
 */
export type QueryTypeName =
  | 'orderAndRange'
  | 'freeTextSearch'
  | 'equality'
  | 'steVecSelector'
  | 'steVecTerm'
  | 'searchableJson'

/** @internal */
export type FfiIndexTypeName = 'ore' | 'match' | 'unique' | 'ste_vec'

export const queryTypes = {
  orderAndRange: 'orderAndRange',
  freeTextSearch: 'freeTextSearch',
  equality: 'equality',
  steVecSelector: 'steVecSelector',
  steVecTerm: 'steVecTerm',
  searchableJson: 'searchableJson',
} as const satisfies Record<string, QueryTypeName>

/** @internal */
export const queryTypeToFfi: Record<QueryTypeName, FfiIndexTypeName> = {
  orderAndRange: 'ore',
  freeTextSearch: 'match',
  equality: 'unique',
  steVecSelector: 'ste_vec',
  steVecTerm: 'ste_vec',
  searchableJson: 'ste_vec',
}

/** @internal */
export const queryTypeToQueryOp: Partial<Record<QueryTypeName, QueryOpName>> = {
  steVecSelector: 'ste_vec_selector',
  steVecTerm: 'ste_vec_term',
}

/** @internal */
export type EncryptQueryOptions = {
  contract: ContractColumnRef
  queryType?: QueryTypeName
  returnType?: EncryptedReturnType
}

export type ScalarQueryTerm = {
  value: JsPlaintext
  contract: ContractColumnRef
  queryType?: QueryTypeName
  returnType?: EncryptedReturnType
}

// ---------------------------------------------------------------------------
// Internal types used by operation classes
// ---------------------------------------------------------------------------

/** @internal Extracted column/table pair from a ContractColumnRef */
export type InternalEncryptOptions = {
  column: EncryptedColumn | EncryptedField
  table: EncryptedTable<EncryptedTableColumn>
}

/** @internal Extracted query options from contract ref */
export type InternalEncryptQueryOptions = {
  column: EncryptedColumn
  table: EncryptedTable<EncryptedTableColumn>
  queryType?: QueryTypeName
  returnType?: EncryptedReturnType
}

/** @internal Extracted scalar query term for batch operations */
export type InternalScalarQueryTerm = {
  value: JsPlaintext
  column: EncryptedColumn
  table: EncryptedTable<EncryptedTableColumn>
  queryType?: QueryTypeName
  returnType?: EncryptedReturnType
}
