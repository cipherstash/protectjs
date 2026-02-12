/**
 * Client-safe exports for @cipherstash/stack
 *
 * This entry point exports types and utilities that can be used in client-side code
 * without requiring the @cipherstash/protect-ffi native module.
 *
 * Use this import path: `@cipherstash/stack/client`
 */

// Schema types and utilities - client-safe (new names)
export {
  encryptedTable,
  encryptedColumn,
  encryptedValue,
  csTable,
  csColumn,
  csValue,
} from '@cipherstash/schema'
export type {
  EncryptedColumn,
  EncryptedTable,
  EncryptedTableColumn,
  EncryptedValue,
  ProtectColumn,
  ProtectTable,
  ProtectTableColumn,
  ProtectValue,
} from '@cipherstash/schema'
export type { EncryptionClient } from './ffi'
/** @deprecated Use EncryptionClient */
export type { EncryptionClient as ProtectClient } from './ffi'
