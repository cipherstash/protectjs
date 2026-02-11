import type {
  Encrypted as CipherStashEncrypted,
  JsPlaintext,
  newClient,
} from '@cipherstash/protect-ffi'
import type {
  ProtectColumn,
  ProtectTable,
  ProtectTableColumn,
  ProtectValue,
} from '@cipherstash/schema'

/**
 * Type to represent the client object
 */
export type Client = Awaited<ReturnType<typeof newClient>> | undefined

/**
 * Type to represent an encrypted payload
 */
export type Encrypted = CipherStashEncrypted | null

/**
 * Represents an encrypted payload in the database
 * @deprecated Use `Encrypted` instead
 */
export type EncryptedPayload = Encrypted | null

/**
 * Represents an encrypted data object in the database
 * @deprecated Use `Encrypted` instead
 */
export type EncryptedData = Encrypted | null

/**
 * Represents a value that will be encrypted and used in a search
 */
export type SearchTerm = {
  value: JsPlaintext
  column: ProtectColumn
  table: ProtectTable<ProtectTableColumn>
  returnType?: 'eql' | 'composite-literal' | 'escaped-composite-literal'
}

export type KeysetIdentifier =
  | {
      name: string
    }
  | {
      id: string
    }

/**
 * The return type of the search term based on the return type specified in the `SearchTerm` type
 * If the return type is `eql`, the return type is `Encrypted`
 * If the return type is `composite-literal`, the return type is `string` where the value is a composite literal
 * If the return type is `escaped-composite-literal`, the return type is `string` where the value is an escaped composite literal
 */
export type EncryptedSearchTerm = Encrypted | string

/**
 * Result type for encryptQuery batch operations.
 * Can be Encrypted (default), string (for composite-literal formats), or null.
 */
export type EncryptedQueryResult = Encrypted | string | null

/**
 * Represents a payload to be encrypted using the `encrypt` function
 */
export type EncryptPayload = JsPlaintext | null

/**
 * Represents the options for encrypting a payload using the `encrypt` function
 */
export type EncryptOptions = {
  column: ProtectColumn | ProtectValue
  table: ProtectTable<ProtectTableColumn>
}

/**
 * Type to identify encrypted fields in a model
 */
export type EncryptedFields<T> = {
  [K in keyof T as T[K] extends Encrypted ? K : never]: T[K]
}

/**
 * Type to identify non-encrypted fields in a model
 */
export type OtherFields<T> = {
  [K in keyof T as T[K] extends Encrypted ? never : K]: T[K]
}

/**
 * Type to represent decrypted fields in a model
 */
export type DecryptedFields<T> = {
  [K in keyof T as T[K] extends Encrypted ? K : never]: string
}

/**
 * Represents a model with plaintext (decrypted) values instead of the EQL/JSONB types
 */
export type Decrypted<T> = OtherFields<T> & DecryptedFields<T>

/**
 * Types for bulk encryption and decryption operations.
 */
export type BulkEncryptPayload = Array<{
  id?: string
  plaintext: JsPlaintext | null
}>

export type BulkEncryptedData = Array<{ id?: string; data: Encrypted }>
export type BulkDecryptPayload = Array<{ id?: string; data: Encrypted }>
export type BulkDecryptedData = Array<DecryptionResult<JsPlaintext | null>>

type DecryptionSuccess<T> = {
  error?: never
  data: T
  id?: string
}

type DecryptionError<T> = {
  error: T
  id?: string
  data?: never
}

export type DecryptionResult<T> = DecryptionSuccess<T> | DecryptionError<T>

/**
 * User-facing query type names for encrypting query values.
 *
 * - `'equality'`: For exact match queries. {@link https://cipherstash.com/docs/platform/searchable-encryption/supported-queries/exact | Exact Queries}
 * - `'freeTextSearch'`: For text search queries. {@link https://cipherstash.com/docs/platform/searchable-encryption/supported-queries/match | Match Queries}
 * - `'orderAndRange'`: For comparison and range queries. {@link https://cipherstash.com/docs/platform/searchable-encryption/supported-queries/range | Range Queries}
 */
export type QueryTypeName = 'orderAndRange' | 'freeTextSearch' | 'equality'

/**
 * Internal FFI index type names.
 * @internal
 */
export type FfiIndexTypeName = 'ore' | 'match' | 'unique'

/**
 * Query type constants for use with encryptQuery().
 */
export const queryTypes = {
  orderAndRange: 'orderAndRange',
  freeTextSearch: 'freeTextSearch',
  equality: 'equality',
} as const satisfies Record<string, QueryTypeName>

/**
 * Maps user-friendly query type names to FFI index type names.
 * @internal
 */
export const queryTypeToFfi: Record<QueryTypeName, FfiIndexTypeName> = {
  orderAndRange: 'ore',
  freeTextSearch: 'match',
  equality: 'unique',
}

/**
 * Base type for query term options shared between single and bulk operations.
 * @internal
 */
export type QueryTermBase = {
  column: ProtectColumn
  table: ProtectTable<ProtectTableColumn>
  queryType?: QueryTypeName // Optional - auto-infers if omitted
  /**
   * The format for the returned encrypted value:
   * - `'eql'` (default) - Returns raw Encrypted object
   * - `'composite-literal'` - Returns PostgreSQL composite literal format `("json")`
   * - `'escaped-composite-literal'` - Returns escaped format `"(\"json\")"`
   */
  returnType?: 'eql' | 'composite-literal' | 'escaped-composite-literal'
}

/**
 * Options for encrypting a single query term.
 */
export type EncryptQueryOptions = QueryTermBase

/**
 * Individual query term for bulk operations.
 */
export type ScalarQueryTerm = QueryTermBase & {
  value: JsPlaintext | null
}
