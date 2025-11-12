import type { KeysetIdentifier as KeysetIdentifierFfi } from '@cipherstash/protect-ffi'
import type { Encrypted, KeysetIdentifier } from '../types'

/**
 * Wrapper shape that mimics the Postgres composite type created by EQL. Use it
 * when passing encrypted payloads through libraries that expect explicit
 * `{ data: ... }` objects.
 */
export type EncryptedPgComposite = {
  data: Encrypted
}

/**
 * Convert an encrypted payload into the composite literal expected by the
 * `eql_v2_encrypted` Postgres type. This is primarily useful when working with
 * ORMs (such as Drizzle or Prisma) that cannot transparently serialise the EQL
 * object shape.
 *
 * @param obj - An encrypted payload produced by Protect.js. `null` values are
 * preserved.
 * @returns An object with a `data` property that matches the composite layout
 * consumed by Postgres drivers.
 */
export function encryptedToPgComposite(obj: Encrypted): EncryptedPgComposite {
  return {
    data: obj,
  }
}

/**
 * Transform every encrypted field on a model into its composite representation.
 * Non-encrypted properties are returned untouched, so the output can be sent
 * directly to Postgres drivers that understand composite columns.
 *
 * @param model - A Protect.js model containing encrypted payloads (typically
 * produced by `encryptModel` or `bulkEncryptModels`).
 * @returns A shallow copy where encrypted fields have been wrapped using
 * {@link encryptedToPgComposite}.
 */
export function modelToEncryptedPgComposites<T extends Record<string, unknown>>(
  model: T,
): T {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(model)) {
    if (isEncryptedPayload(value)) {
      result[key] = encryptedToPgComposite(value)
    } else {
      result[key] = value
    }
  }

  return result as T
}

/**
 * Vectorised version of {@link modelToEncryptedPgComposites} that processes an
 * array of models, maintaining order and shape. Ideal for bulk persistence
 * routines.
 *
 * @param models - Collection of Protect.js models with encrypted fields.
 * @returns Models with encrypted fields wrapped in composite-safe structures.
 */
export function bulkModelsToEncryptedPgComposites<
  T extends Record<string, unknown>,
>(models: T[]): T[] {
  return models.map((model) => modelToEncryptedPgComposites(model))
}

/**
 * Convert a high-level keyset identifier into the FFI-friendly discriminated
 * union expected by ZeroKMS. Internally, the FFI differentiates keysets by
 * either name (`{ Name: string }`) or UUID (`{ Uuid: string }`).
 *
 * @param keyset - Optional keyset from user configuration.
 * @returns The FFI representation when provided, otherwise `undefined`.
 */
export function toFfiKeysetIdentifier(
  keyset: KeysetIdentifier | undefined,
): KeysetIdentifierFfi | undefined {
  if (!keyset) return undefined

  if ('name' in keyset) {
    return { Name: keyset.name }
  }

  return { Uuid: keyset.id }
}

/**
 * Determine if a runtime value matches the minimal EQL payload contract. This
 * is a convenience check when walking nested object graphs and deciding which
 * properties should be serialised as encrypted composites.
 *
 * @param value - Unknown value to inspect.
 * @returns `true` when the value resembles an EQL payload; otherwise `false`.
 */
export function isEncryptedPayload(value: unknown): value is Encrypted {
  if (value === null) return false

  // TODO: this can definitely be improved
  if (typeof value === 'object') {
    const obj = value as Encrypted
    return (
      obj !== null && 'v' in obj && ('c' in obj || 'sv' in obj) && 'i' in obj
    )
  }

  return false
}
