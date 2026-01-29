import type { KeysetIdentifier as KeysetIdentifierFfi } from '@cipherstash/protect-ffi'
import type { Encrypted, KeysetIdentifier } from '../types'

/**
 * Represents an encrypted payload formatted for a PostgreSQL composite type (`eql_v2_encrypted`).
 */
export type EncryptedPgComposite = {
  /** The raw encrypted data object. */
  data: Encrypted
}

/**
 * Transforms an encrypted payload into a PostgreSQL composite type format.
 *
 * This is required when inserting encrypted data into a column defined as `eql_v2_encrypted`
 * using a PostgreSQL client or SDK (like Supabase).
 *
 * @param obj - The encrypted payload object.
 *
 * @example
 * **Supabase SDK Integration**
 * ```typescript
 * const { data, error } = await supabase
 *   .from('users')
 *   .insert([encryptedToPgComposite(encryptedResult.data)])
 * ```
 */
export function encryptedToPgComposite(obj: Encrypted): EncryptedPgComposite {
  return {
    data: obj,
  }
}

/**
 * Transforms all encrypted fields within a model into PostgreSQL composite types.
 *
 * Automatically detects fields that look like encrypted payloads and wraps them
 * in the structure expected by PostgreSQL's `eql_v2_encrypted` composite type.
 *
 * @param model - An object containing one or more encrypted fields.
 *
 * @example
 * **Supabase Model Integration**
 * ```typescript
 * const encryptedModel = await protectClient.encryptModel(user, usersTable);
 * const { data, error } = await supabase
 *   .from('users')
 *   .insert([modelToEncryptedPgComposites(encryptedModel.data)])
 * ```
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
 * Transforms multiple models' encrypted fields into PostgreSQL composite types.
 *
 * @param models - An array of objects containing encrypted fields.
 *
 * @example
 * ```typescript
 * const encryptedModels = await protectClient.bulkEncryptModels(users, usersTable);
 * await supabase
 *   .from('users')
 *   .insert(bulkModelsToEncryptedPgComposites(encryptedModels.data))
 * ```
 */
export function bulkModelsToEncryptedPgComposites<
  T extends Record<string, unknown>,
>(models: T[]): T[] {
  return models.map((model) => modelToEncryptedPgComposites(model))
}

/**
 * @internal
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
 * Checks if a value is an encrypted payload object.
 *
 * @param value - The value to check.
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