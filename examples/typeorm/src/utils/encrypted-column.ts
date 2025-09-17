import type { EncryptedData } from '@cipherstash/protect'
import type { ColumnOptions } from 'typeorm'

/**
 * Transformer for encrypted data columns that handles PostgreSQL composite literal format
 * automatically. This eliminates the need for manual lifecycle hooks.
 */
export const encryptedDataTransformer = {
  /**
   * Transform encrypted data to PostgreSQL composite literal format for storage
   */
  to(value: EncryptedData | null): string | null {
    if (value === null || value === undefined) {
      return null
    }

    // Convert to PostgreSQL composite literal format: (json_string)
    return `(${JSON.stringify(JSON.stringify(value))})`
  },

  /**
   * Transform PostgreSQL composite literal format back to encrypted data object
   */
  from(value: string | null): EncryptedData | null {
    if (!value || typeof value !== 'string') {
      return null
    }

    try {
      let jsonString: string = value.trim()

      // Remove outer parentheses if they exist
      if (jsonString.startsWith('(') && jsonString.endsWith(')')) {
        jsonString = jsonString.slice(1, -1)
      }

      // Handle PostgreSQL's double-quote escaping: "" -> "
      jsonString = jsonString.replace(/""/g, '"')

      // Remove outer quotes if they exist
      if (jsonString.startsWith('"') && jsonString.endsWith('"')) {
        jsonString = jsonString.slice(1, -1)
      }

      // Parse the JSON string
      return JSON.parse(jsonString)
    } catch (error: unknown) {
      console.error('Failed to parse encrypted data:', {
        original: value,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      // Return null if parsing fails to avoid breaking the application
      return null
    }
  },
}

/**
 * Enhanced column options for encrypted data with automatic transformation
 */
export interface EncryptedColumnOptions
  extends Omit<ColumnOptions, 'type' | 'transformer'> {
  /**
   * Whether the column can be null. Defaults to true for encrypted columns.
   */
  nullable?: boolean
}

/**
 * Creates column options for an encrypted column with automatic PostgreSQL transformation
 */
export function createEncryptedColumnOptions(
  options: EncryptedColumnOptions = {},
): ColumnOptions {
  return {
    // biome-ignore lint/suspicious/noExplicitAny: TypeORM doesn't know about our custom type
    type: 'eql_v2_encrypted' as any,
    nullable: true, // Default to nullable for encrypted columns
    transformer: encryptedDataTransformer,
    ...options,
  }
}
