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
 * Thin wrapper around the underlying native client returned by
 * `@cipherstash/protect-ffi`. Exposed for advanced scenarios (e.g. diagnostic
 * tooling) where direct access to the compiled runtime is required.
 */
export type Client = Awaited<ReturnType<typeof newClient>> | undefined

/**
 * Canonical encrypted payload format produced by Protect.js. The structure
 * mirrors the EQL JSON payload stored in your database (see the README for the
 * contract shape) and may be `null` when a column stores nullable values.
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
 * Defines a plaintext value and its schema metadata so Protect.js can derive
 * encrypted search terms. Use this when bridging from user input to
 * PostgreSQL queries without exposing sensitive data.
 */
export type SearchTerm = {
  value: JsPlaintext
  column: ProtectColumn
  table: ProtectTable<ProtectTableColumn>
  returnType?: 'eql' | 'composite-literal' | 'escaped-composite-literal'
}

/**
 * Identifies a CipherStash keyset. Provide either a human-readable name or the
 * UUID exported from the CipherStash dashboard when enforcing tenant-isolated
 * cryptographic domains.
 */
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
 * Plaintext payload accepted by the `encrypt` operation. Strings and structured
 * JSON values are supported; `null` preserves empty database fields without
 * round-tripping through encryption.
 */
export type EncryptPayload = JsPlaintext | null

/**
 * Schema metadata describing which table/column pair should receive the
 * ciphertext. This is required so ZeroKMS can enforce the correct index suite
 * and you retain deterministic search behaviour.
 */
export type EncryptOptions = {
  column: ProtectColumn | ProtectValue
  table: ProtectTable<ProtectTableColumn>
}

/**
 * Utility type that extracts the encrypted fields from a model returned by
 * Protect.js. Handy when composing typed persistence layers where you need to
 * identify payloads that remain in EQL form.
 */
export type EncryptedFields<T> = {
  [K in keyof T as T[K] extends Encrypted ? K : never]: T[K]
}

/**
 * Complements {@link EncryptedFields} by picking the plaintext fields in a
 * model—this is useful when projecting decrypted values back into domain
 * objects.
 */
export type OtherFields<T> = {
  [K in keyof T as T[K] extends Encrypted ? never : K]: T[K]
}

/**
 * Represents the decrypted view of any fields that were encrypted in storage.
 * When using `decryptModel` or `bulkDecryptModels`, the resulting type replaces
 * EQL payloads with human-readable values (usually strings).
 */
export type DecryptedFields<T> = {
  [K in keyof T as T[K] extends Encrypted ? K : never]: string
}

/**
 * Convenience type that combines decrypted Protect fields with any untouched
 * properties on the model. Use this when accepting user-submitted data that has
 * already been decrypted.
 */
export type Decrypted<T> = OtherFields<T> & DecryptedFields<T>

/**
 * Types for bulk encryption and decryption operations.
 */
/**
 * Batching payload used by `bulkEncrypt`. Each entry may carry an optional ID
 * so you can correlate responses in high-throughput ingestion pipelines.
 */
export type BulkEncryptPayload = Array<{
  id?: string
  plaintext: JsPlaintext | null
}>

/**
 * Result payload produced by `bulkEncrypt`. Each item mirrors the original ID
 * (when supplied) and the generated encrypted payload ready for persistence.
 */
export type BulkEncryptedData = Array<{ id?: string; data: Encrypted }>
/**
 * Batching payload consumed by `bulkDecrypt`. Provide the encrypted payload and
 * an optional correlation identifier.
 */
export type BulkDecryptPayload = Array<{ id?: string; data: Encrypted }>
/**
 * Response payload returned from `bulkDecrypt`. Individual items may succeed or
 * fail—ZeroKMS reports errors per record so you can retry without replaying the
 * entire batch.
 */
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

/**
 * Represents the outcome of a single item inside a bulk decryption call. A
 * result contains either `data` when decryption succeeds, or an `error`
 * describing why that specific record could not be processed.
 */
export type DecryptionResult<T> = DecryptionSuccess<T> | DecryptionError<T>
