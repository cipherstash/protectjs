import {
  ProtectError as FfiEncryptionError,
  type ProtectErrorCode,
} from '@cipherstash/protect-ffi'

/**
 * Extracts FFI error code from an error if it's an FFI error, otherwise returns undefined.
 * Used to preserve specific error codes in EncryptionError responses.
 */
export function getErrorCode(error: unknown): ProtectErrorCode | undefined {
  return error instanceof FfiEncryptionError ? error.code : undefined
}
