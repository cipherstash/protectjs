/**
 * Utilities for encoding/decoding encrypted values to PostgreSQL composite type format
 *
 * The eql_v2_encrypted type uses PostgreSQL composite type format: ("json_string")
 * with doubled quotes for escaping: {"key":"value"} becomes ("{"key":"value"}")
 *
 * These utilities allow manual encoding when not using hooks.
 */

/**
 * Convert encrypted data to PostgreSQL composite type format
 *
 * This is required when passing encrypted values directly to Sequelize WHERE clauses
 * without using hooks.
 *
 * @param value - The encrypted object from protectClient.encrypt()
 * @returns PostgreSQL composite type string: ("json_with_escaped_quotes")
 *
 * @example
 * ```typescript
 * import { Op } from 'sequelize'
 * import { toComposite } from '@cipherstash/sequelize'
 *
 * // Encrypt a value
 * const encrypted = await protectClient.encrypt(1000.00, {
 *   table: protectTransactions,
 *   column: protectTransactions.amount
 * })
 *
 * // Convert to composite format for Sequelize WHERE clause
 * const composite = toComposite(encrypted.data)
 *
 * // Query with Op.gte
 * const results = await Transaction.findAll({
 *   where: {
 *     amount: { [Op.gte]: composite }
 *   }
 * })
 * ```
 */
export function toComposite(value: any): string {
  const jsonStr = JSON.stringify(value)
  const escaped = jsonStr.replace(/"/g, '""')
  return `("${escaped}")`
}

/**
 * Parse PostgreSQL composite type format back to encrypted object
 *
 * Use this when reading encrypted data directly from PostgreSQL without hooks.
 *
 * @param value - PostgreSQL composite type string: ("json_with_escaped_quotes")
 * @returns Parsed encrypted object
 *
 * @example
 * ```typescript
 * import { fromComposite } from '@cipherstash/sequelize'
 *
 * // Read raw encrypted data from database
 * const [raw] = await sequelize.query(
 *   'SELECT email FROM users WHERE id = ?',
 *   { replacements: [userId] }
 * )
 *
 * // Parse composite type
 * const encrypted = fromComposite(raw.email)
 * // { c: "ciphertext...", k: "...", ... }
 *
 * // Decrypt
 * const decrypted = await protectClient.decrypt(encrypted)
 * console.log(decrypted.data) // "alice@example.com"
 * ```
 */
export function fromComposite(value: string): any {
  if (!value || value === '' || typeof value !== 'string') {
    return null
  }

  try {
    const trimmed = value.trim()

    // Match PostgreSQL composite type: ("...")
    if (trimmed.startsWith('("') && trimmed.endsWith('")')) {
      // Remove outer (" and ")
      const inner = trimmed.slice(2, -2)
      // Unescape PostgreSQL doubled quotes
      const unescaped = inner.replace(/""/g, '"')
      // Parse JSON
      return JSON.parse(unescaped)
    }

    // Try parsing directly if not in composite format
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return JSON.parse(trimmed)
    }

    return value
  } catch (error) {
    throw new Error(
      `Failed to parse PostgreSQL composite type value: ${value}. ` +
      `Error: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Bulk convert encrypted values to composite type format
 *
 * Useful for Op.in queries with multiple encrypted values.
 *
 * @param values - Array of encrypted objects
 * @returns Array of composite type strings
 *
 * @example
 * ```typescript
 * import { Op } from 'sequelize'
 * import { bulkToComposite } from '@cipherstash/sequelize'
 *
 * // Encrypt multiple values
 * const emails = ['alice@example.com', 'bob@example.com']
 * const encrypted = await Promise.all(
 *   emails.map(email =>
 *     protectClient.encrypt(email, {
 *       table: protectUsers,
 *       column: protectUsers.email
 *     })
 *   )
 * )
 *
 * // Convert to composite format for Op.in
 * const composite = bulkToComposite(encrypted.map(e => e.data))
 *
 * // Query
 * const users = await User.findAll({
 *   where: {
 *     email: { [Op.in]: composite }
 *   }
 * })
 * ```
 */
export function bulkToComposite(values: any[]): string[] {
  return values.map(toComposite)
}

/**
 * Parse composite type values in model objects (similar to Drizzle's workflow)
 *
 * Automatically detects and parses all composite type fields in model objects,
 * making them ready for bulkDecryptModels.
 *
 * @param models - Array of Sequelize model instances or plain objects with composite type values
 * @returns Array of models with parsed encrypted objects
 *
 * @example
 * ```typescript
 * import { bulkFromComposite } from '@cipherstash/sequelize'
 *
 * // Query returns models with composite type strings
 * const users = await User.findAll()
 *
 * // Parse all composite type fields in the models
 * const parsed = bulkFromComposite(users)
 *
 * // Decrypt (same API as Drizzle)
 * const decrypted = await protectClient.bulkDecryptModels(parsed)
 * ```
 */
export function bulkFromComposite<T extends Record<string, any>>(
  models: T[],
): T[] {
  if (!models || models.length === 0) {
    return []
  }

  return models.map((model) => {
    // Handle Sequelize model instances by converting to plain object
    const plainModel =
      typeof model.get === 'function' ? model.get({ plain: true }) : model

    // Create a shallow copy to avoid mutating the original
    const result = { ...plainModel }

    // Recursively process all fields
    const processValue = (value: any): any => {
      // Handle null/undefined
      if (value == null) {
        return value
      }

      // Handle arrays
      if (Array.isArray(value)) {
        return value.map(processValue)
      }

      // Handle objects
      if (typeof value === 'object') {
        const processed: Record<string, any> = {}
        for (const [key, val] of Object.entries(value)) {
          processed[key] = processValue(val)
        }
        return processed
      }

      // Try to parse as composite type
      if (typeof value === 'string') {
        try {
          // Only parse if it looks like a composite type
          const trimmed = value.trim()
          if (trimmed.startsWith('("') && trimmed.endsWith('")')) {
            return fromComposite(value)
          }
        } catch {
          // If parsing fails, return original value
        }
      }

      return value
    }

    // Process all top-level fields
    for (const [key, value] of Object.entries(result)) {
      result[key] = processValue(value)
    }

    return result as T
  })
}
