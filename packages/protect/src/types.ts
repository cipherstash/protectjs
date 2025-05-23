import type { newClient, Encrypted } from '@cipherstash/protect-ffi'
import type { ProtectTableColumn } from './schema'
import type { ProtectTable } from './schema'
import type { ProtectColumn } from './schema'

/**
 * Type to represent the client object
 */
export type Client = Awaited<ReturnType<typeof newClient>> | undefined

/**
 * Represents an encrypted payload in the database
 */
export type EncryptedPayload = Encrypted | null

/**
 * Represents a payload to be encrypted using the `encrypt` function
 * We currently only support the encryption of strings
 */
export type EncryptPayload = string | null

/**
 * Represents the options for encrypting a payload using the `encrypt` function
 */
export type EncryptOptions = {
  column: ProtectColumn
  table: ProtectTable<ProtectTableColumn>
}

/**
 * Type to identify encrypted fields in a model
 */
export type EncryptedFields<T> = {
  [K in keyof T as T[K] extends EncryptedPayload ? K : never]: T[K]
}

/**
 * Type to identify non-encrypted fields in a model
 */
export type OtherFields<T> = {
  [K in keyof T as T[K] extends EncryptedPayload | null ? never : K]: T[K]
}

/**
 * Type to represent decrypted fields in a model
 */
export type DecryptedFields<T> = {
  [K in keyof T as T[K] extends EncryptedPayload | null ? K : never]: string
}

/**
 * Represents a model with plaintext (decrypted) values instead of the EQL/JSONB types
 */
export type Decrypted<T> = OtherFields<T> & DecryptedFields<T>
