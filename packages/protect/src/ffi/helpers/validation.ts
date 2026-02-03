import { type ProtectError, ProtectErrorTypes } from '../..'
import type { Result } from '@byteslice/result'

/**
 * Validates that a value is not NaN or Infinity.
 * Returns a failure Result if validation fails, undefined otherwise.
 * Use this in async flows that return Result types.
 *
 * @internal
 */
export function validateNumericValue(
  value: unknown
): Result<undefined, ProtectError> | undefined {
  if (typeof value === 'number' && Number.isNaN(value)) {
    return {
      failure: {
        type: ProtectErrorTypes.EncryptionError,
        message: '[protect]: Cannot encrypt NaN value',
      },
    }
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return {
      failure: {
        type: ProtectErrorTypes.EncryptionError,
        message: '[protect]: Cannot encrypt Infinity value',
      },
    }
  }
  return undefined
}

/**
 * Validates that a value is not NaN or Infinity.
 * Throws an error if validation fails.
 * Use this in sync flows where exceptions are caught.
 *
 * @internal
 */
export function assertValidNumericValue(value: unknown): void {
  if (typeof value === 'number' && Number.isNaN(value)) {
    throw new Error('[protect]: Cannot encrypt NaN value')
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error('[protect]: Cannot encrypt Infinity value')
  }
}
