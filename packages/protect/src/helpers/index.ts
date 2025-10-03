import type { Encrypted } from '../types'

export type EncryptedPgComposite = {
  data: Encrypted
}

/**
 * Helper function to transform an encrypted payload into a PostgreSQL composite type
 */
export function encryptedToPgComposite(obj: Encrypted): EncryptedPgComposite {
  return {
    data: obj,
  }
}

/**
 * Helper function to transform a model's encrypted fields into PostgreSQL composite types
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
 * Helper function to transform multiple models' encrypted fields into PostgreSQL composite types
 */
export function bulkModelsToEncryptedPgComposites<
  T extends Record<string, unknown>,
>(models: T[]): T[] {
  return models.map((model) => modelToEncryptedPgComposites(model))
}

/**
 * Helper function to check if a value is an encrypted payload
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
