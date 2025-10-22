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
