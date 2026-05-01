import type { EncryptedDataType } from './constants'

/**
 * Structured codec errors.
 *
 * Application-level error handling can pattern-match on `code` for the
 * failure modes that matter:
 *
 *   - `JS_TYPE_MISMATCH`           — value's JS type doesn't match the
 *                                    column's declared `dataType`.
 *   - `UNSUPPORTED_PLAINTEXT_TYPE` — value's JS type is outside the
 *                                    five-way `EncryptedDataType` union
 *                                    (`bigint`, `symbol`, `function`).
 *   - `INVALID_QUERY_TERM`         — query-term codec received a value
 *                                    that doesn't fit the term's required
 *                                    JS type.
 *   - `DECODE_ROUND_TRIP_BROKEN`   — decode-side shape mismatch between
 *                                    the FFI's `cast_as` output and the
 *                                    JS-side type we expected, or a
 *                                    decryption failure surfaced from
 *                                    the SDK's per-row error envelope.
 *   - `NO_COLUMN_FOR_DATATYPE`     — encode-time dispatch could not
 *                                    find a contract column matching
 *                                    the JS-runtime data type.
 *   - `CONFIG_MISSING_ENV`         — `cipherstashEncryption()` was
 *                                    constructed without `encryptionClient`
 *                                    and one or more required env vars
 *                                    are absent.
 *   - `NO_CONTRACT_SCHEMAS`        — default-client construction was
 *                                    requested but the contract declared
 *                                    no encrypted columns.
 */

export type CipherStashCodecErrorCode =
  | 'JS_TYPE_MISMATCH'
  | 'UNSUPPORTED_PLAINTEXT_TYPE'
  | 'INVALID_QUERY_TERM'
  | 'DECODE_ROUND_TRIP_BROKEN'
  | 'NO_COLUMN_FOR_DATATYPE'
  | 'CONFIG_MISSING_ENV'
  | 'NO_CONTRACT_SCHEMAS'

export interface CipherStashCodecErrorOptions {
  readonly code: CipherStashCodecErrorCode
  readonly message: string
  readonly column: string | undefined
  readonly expectedDataType: EncryptedDataType | undefined
  readonly actualType: string
  readonly cause?: unknown
}

export class CipherStashCodecError extends Error {
  readonly code: CipherStashCodecErrorCode
  readonly column: string | undefined
  readonly expectedDataType: EncryptedDataType | undefined
  readonly actualType: string

  constructor(opts: CipherStashCodecErrorOptions) {
    super(opts.message, opts.cause ? { cause: opts.cause } : undefined)
    this.name = 'CipherStashCodecError'
    this.code = opts.code
    this.column = opts.column
    this.expectedDataType = opts.expectedDataType
    this.actualType = opts.actualType
  }
}

/**
 * Derive the JS-runtime dataType for a value.
 */
export function inferJsDataType(value: unknown): EncryptedDataType | undefined {
  if (value instanceof Date) return 'date'
  switch (typeof value) {
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'string':
      return 'string'
    case 'object':
      // Treat plain objects (including arrays) as JSON; null is filtered
      // upstream so we never see it here.
      return 'json'
    default:
      return undefined
  }
}

/**
 * JS-runtime-type guard at encode time.
 *
 * When `expectedDataType` is supplied (i.e. the caller knows the
 * contract column's declared `dataType`), the guard cross-checks the
 * JS-derived data type and throws `JS_TYPE_MISMATCH` on mismatch.
 *
 * When `expectedDataType` is `undefined`, the guard still rejects
 * unsupported JS types (`bigint`, `symbol`, `function`) with
 * `UNSUPPORTED_PLAINTEXT_TYPE`, but skips the cross-check.
 *
 * The `column` field on the resulting error is the contract column's
 * underlying database name (when known), so error consumers can
 * correlate the failure back to the user's schema authoring site.
 */
export function assertJsTypeMatchesDataType(
  value: unknown,
  expectedDataType: EncryptedDataType | undefined,
  columnName: string | undefined = undefined,
): EncryptedDataType {
  const jsDataType = inferJsDataType(value)
  if (jsDataType === undefined) {
    throw new CipherStashCodecError({
      code: 'UNSUPPORTED_PLAINTEXT_TYPE',
      message: `Unsupported plaintext type for encrypted column${
        columnName ? ` '${columnName}'` : ''
      }: JS type '${describeJs(value)}' is not in the supported set (string | number | boolean | Date | object).`,
      column: columnName,
      expectedDataType,
      actualType: describeJs(value),
    })
  }

  if (expectedDataType !== undefined && expectedDataType !== jsDataType) {
    throw new CipherStashCodecError({
      code: 'JS_TYPE_MISMATCH',
      message: `Value type mismatch for encrypted column${
        columnName ? ` '${columnName}'` : ''
      }: expected dataType '${expectedDataType}', got JS type '${describeJs(value)}' (dataType '${jsDataType}').`,
      column: columnName,
      expectedDataType,
      actualType: describeJs(value),
    })
  }

  return jsDataType
}

/**
 * Human-readable description of a JS value's runtime type, used in error
 * messages.
 */
export function describeJs(value: unknown): string {
  if (value === null) return 'null'
  if (value instanceof Date) return 'Date'
  if (Array.isArray(value)) return 'array'
  return typeof value
}
