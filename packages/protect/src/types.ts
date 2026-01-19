import type {
  Encrypted as CipherStashEncrypted,
  JsPlaintext as FfiJsPlaintext,
  newClient,
} from '@cipherstash/protect-ffi'

export type { JsPlaintext } from '@cipherstash/protect-ffi'

/**
 * Index type for query encryption.
 * - 'ore': Order-Revealing Encryption for range queries (<, >, BETWEEN)
 * - 'match': Fuzzy/substring search
 * - 'unique': Exact equality matching
 * - 'ste_vec': Structured Text Encryption Vector for JSON path/containment queries
 */
export type IndexTypeName = 'ore' | 'match' | 'unique' | 'ste_vec'

/**
 * Query operation type for ste_vec index.
 * - 'default': Standard JSON query using column's cast_type
 * - 'ste_vec_selector': JSON path selection ($.user.email)
 * - 'ste_vec_term': JSON containment (@>)
 */
export type QueryOpName = 'default' | 'ste_vec_selector' | 'ste_vec_term'
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
 * Simple search term for basic value encryption (original SearchTerm behavior)
 */
export type SimpleSearchTerm = {
  value: FfiJsPlaintext
  column: ProtectColumn
  table: ProtectTable<ProtectTableColumn>
  returnType?: 'eql' | 'composite-literal' | 'escaped-composite-literal'
}

/**
 * Represents a value that will be encrypted and used in a search.
 * Can be a simple value search, JSON path search, or JSON containment search.
 */
export type SearchTerm = SimpleSearchTerm | JsonPathSearchTerm | JsonContainmentSearchTerm

/**
 * Options for encrypting a query term with explicit index type control.
 * Used with encryptQuery() for single-value query encryption.
 */
export type EncryptQueryOptions = {
  /** The column definition from the schema */
  column: ProtectColumn | ProtectValue
  /** The table definition from the schema */
  table: ProtectTable<ProtectTableColumn>
  /** Which index type to use for the query */
  indexType: IndexTypeName
  /** Query operation (defaults to 'default') */
  queryOp?: QueryOpName
}

/**
 * Individual query payload for bulk query operations.
 * Used with createQuerySearchTerms() for batch query encryption.
 */
export type QuerySearchTerm = {
  /** The value to encrypt for querying */
  value: FfiJsPlaintext
  /** The column definition */
  column: ProtectColumn | ProtectValue
  /** The table definition */
  table: ProtectTable<ProtectTableColumn>
  /** Which index type to use */
  indexType: IndexTypeName
  /** Query operation (optional, defaults to 'default') */
  queryOp?: QueryOpName
  /** Return format for the encrypted result */
  returnType?: 'eql' | 'composite-literal' | 'escaped-composite-literal'
}

/**
 * JSON path - either dot-notation string ('user.email') or array of keys (['user', 'email'])
 */
export type JsonPath = string | string[]

/**
 * Search term for JSON containment queries (@> / <@)
 */
export type JsonContainmentSearchTerm = {
  /** The JSON object or partial object to search for */
  value: Record<string, unknown>
  column: ProtectColumn
  table: ProtectTable<ProtectTableColumn>
  /** Type of containment: 'contains' for @>, 'contained_by' for <@ */
  containmentType: 'contains' | 'contained_by'
  returnType?: 'eql' | 'composite-literal' | 'escaped-composite-literal'
}

/**
 * Search term for JSON path access queries (-> / ->>)
 */
export type JsonPathSearchTerm = {
  /** The path to navigate to in the JSON */
  path: JsonPath
  /** The value to compare at the path (optional, for WHERE clauses) */
  value?: FfiJsPlaintext
  column: ProtectColumn
  table: ProtectTable<ProtectTableColumn>
  returnType?: 'eql' | 'composite-literal' | 'escaped-composite-literal'
}

/**
 * Union type for JSON search operations
 */
export type JsonSearchTerm = JsonContainmentSearchTerm | JsonPathSearchTerm

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
 * Represents a payload to be encrypted using the `encrypt` function
 */
export type EncryptPayload = FfiJsPlaintext | null

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
  plaintext: FfiJsPlaintext | null
}>

export type BulkEncryptedData = Array<{ id?: string; data: Encrypted }>
export type BulkDecryptPayload = Array<{ id?: string; data: Encrypted }>
export type BulkDecryptedData = Array<DecryptionResult<FfiJsPlaintext | null>>

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
