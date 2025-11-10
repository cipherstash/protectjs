import { DataTypes } from 'sequelize'
import type { EncryptedColumnConfig } from './types'

/**
 * Creates the ENCRYPTED data type factory for Sequelize
 *
 * Usage:
 *   const ENCRYPTED = createEncryptedType()
 *   User.init({
 *     email: { type: ENCRYPTED('email', { equality: true }) }
 *   })
 *
 * Note: Each factory maintains its own registry of column configurations.
 * This prevents memory leaks and test pollution from global state.
 */
export function createEncryptedType() {
  /**
   * Registry to store encrypted column configurations for this factory instance
   * Keyed by column name for hook access
   * Scoped to this factory to prevent global state pollution
   */
  const encryptedColumnRegistry = new Map<string, EncryptedColumnConfig & { columnName: string }>()
  /**
   * Parse composite type value from PostgreSQL: ("ciphertext")
   * PostgreSQL uses "" (doubled quotes) to escape quotes in composite types
   */
  function parse(value: string): any {
    if (!value || value === '') return null

    try {
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
    } catch (error) {
      throw new Error(
        `Failed to parse PostgreSQL composite type value: ${value}. ` +
        `Error: ${error instanceof Error ? error.message : String(error)}`
      )
    }
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
   * Interface for ENCRYPTED constructor with static methods
   * Needed because Sequelize's ABSTRACT type replaces the constructor
   */
  interface ENCRYPTEDConstructor extends Function {
    parse?: typeof parse
    stringify?: typeof stringify
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
  const factory = function (
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

    // Attach registry accessor to instance so schema extraction can find configs
    // This is needed because each factory has its own registry
    ;(instance as any)._getColumnConfig = (name: string) => encryptedColumnRegistry.get(name)

    // Attach static methods to instance constructor for Sequelize compatibility
    // This is needed because Sequelize's ABSTRACT replaces the constructor
    const constructor = instance.constructor as ENCRYPTEDConstructor
    if (!constructor.parse) {
      constructor.parse = parse
    }
    if (!constructor.stringify) {
      constructor.stringify = stringify
    }

    return instance
  }

  // Attach registry accessor to factory function for direct access if needed
  factory.getColumnConfig = (columnName: string) => encryptedColumnRegistry.get(columnName)

  return factory
}

/**
 * Get configuration for an encrypted column by name from a column instance
 * Used by schema extraction and hooks to determine how to handle encryption
 *
 * @param columnInstance - The ENCRYPTED column instance created by the factory
 * @param columnName - The column name to look up
 * @returns Column configuration including indexes, or undefined if not found
 *
 * Note: Each ENCRYPTED factory maintains its own registry, so this function
 * accesses the registry through the column instance to ensure we get the
 * correct configuration for this specific factory.
 */
export function getEncryptedColumnConfig(
  columnInstance: any,
  columnName: string
): (EncryptedColumnConfig & { columnName: string }) | undefined {
  // Access the registry through the column instance
  if (typeof columnInstance?._getColumnConfig === 'function') {
    return columnInstance._getColumnConfig(columnName)
  }
  return undefined
}
