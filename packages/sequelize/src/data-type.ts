import { DataTypes } from 'sequelize'
import type { EncryptedColumnConfig } from './types'

/**
 * Registry to store encrypted column configurations
 * Keyed by column name for hook access
 */
const encryptedColumnRegistry = new Map<string, EncryptedColumnConfig & { columnName: string }>()

/**
 * Creates the ENCRYPTED data type factory for Sequelize
 *
 * Usage:
 *   const ENCRYPTED = createEncryptedType()
 *   User.init({
 *     email: { type: ENCRYPTED('email', { equality: true }) }
 *   })
 */
export function createEncryptedType() {
  /**
   * Parse composite type value from PostgreSQL: ("ciphertext")
   * PostgreSQL uses "" (doubled quotes) to escape quotes in composite types
   */
  function parse(value: string): any {
    if (!value || value === '') return null

    const trimmed = value.trim()

    if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
      let inner = trimmed.slice(1, -1)

      if (inner.startsWith('"') && inner.endsWith('"')) {
        // Remove outer quotes
        const stripped = inner.slice(1, -1)
        // Unescape: PostgreSQL uses "" for escaped quotes in composite types
        const unescaped = stripped.replace(/""/g, '"')
        // Now parse the JSON
        return JSON.parse(unescaped)
      }

      // Try parsing as JSON directly
      if (inner.startsWith('{') || inner.startsWith('[')) {
        return JSON.parse(inner)
      }

      return inner
    }

    return JSON.parse(value)
  }

  /**
   * Serialize value to composite type format for PostgreSQL: ("json_string")
   */
  function stringify(value: any): string {
    const jsonStr = JSON.stringify(value)
    const escaped = jsonStr.replace(/"/g, '""')
    return `("${escaped}")`
  }

  /**
   * ENCRYPTED data type class that extends Sequelize ABSTRACT
   */
  class ENCRYPTED extends DataTypes.ABSTRACT {
    static parse = parse
    static stringify = stringify

    constructor() {
      super()
      // Set the key property so toSql() returns the correct value
      this.key = 'eql_v2_encrypted'
    }
  }

  /**
   * Factory function to create column with config
   */
  return function (
    columnName: string,
    config?: Omit<EncryptedColumnConfig, 'columnName'>
  ) {
    const instance = new ENCRYPTED()

    const fullConfig: EncryptedColumnConfig & { columnName: string } = {
      columnName,
      ...config,
    }

    // Store config in registry for hook access
    encryptedColumnRegistry.set(columnName, fullConfig)

    // Attach config to instance for immediate access
    ;(instance as any)._protectConfig = fullConfig

    // Attach static methods to instance constructor for Sequelize compatibility
    // This is needed because Sequelize's ABSTRACT replaces the constructor
    if (!instance.constructor.parse) {
      (instance.constructor as any).parse = parse
    }
    if (!instance.constructor.stringify) {
      (instance.constructor as any).stringify = stringify
    }

    return instance
  }
}

/**
 * Get configuration for an encrypted column by name
 * Used by hooks to determine how to handle encryption
 * Returns config with columnName included for convenience
 */
export function getEncryptedColumnConfig(
  columnName: string
): (EncryptedColumnConfig & { columnName: string }) | undefined {
  return encryptedColumnRegistry.get(columnName)
}
