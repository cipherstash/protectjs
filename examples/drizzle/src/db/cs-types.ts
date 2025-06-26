import { customType } from 'drizzle-orm/pg-core'
import { csColumn, type ProtectColumn } from '@cipherstash/protect'

/**
 * Custom CipherStash encrypted type that uses JSONB storage
 * This type combines Drizzle customType with CipherStash csColumn functionality
 */
export const csEncrypted = <TData = unknown>(
  name: string,
  config: {
    equality?: boolean
    orderAndRange?: boolean
    freeTextSearch?: boolean
  },
) => {
  let csCol = csColumn(name)
  // Create the CipherStash column
  if (config.equality) {
    csCol = csCol.equality()
  }
  if (config.orderAndRange) {
    csCol = csCol.orderAndRange()
  }
  if (config.freeTextSearch) {
    csCol = csCol.freeTextSearch()
  }

  // Create the Drizzle custom type
  const drizzleCol = customType<{ data: TData; driverData: string }>({
    dataType() {
      return 'jsonb'
    },
    toDriver(value: TData): string {
      return JSON.stringify(value)
    },
    fromDriver(value: string): TData {
      return JSON.parse(value)
    },
  })(name)

  // Extend the Drizzle column with access to the CipherStash column
  const extendedColumn = Object.assign(drizzleCol, {
    // Access to the underlying CipherStash column
    getCsColumn: () => csCol,
    // Build method for CipherStash integration
    build: () => csCol.build(),
    getName: () => csCol.getName(),
  })

  return extendedColumn
}

/**
 * Helper function to check if a column is a CipherStash encrypted column
 */
export const isCsEncryptedColumn = (column: unknown): boolean => {
  if (!column || typeof column !== 'object') return false
  const col = column as Record<string, unknown>
  return col.dataType === 'jsonb' && typeof col.getCsColumn === 'function'
}

/**
 * Helper function to create a CipherStash encrypted column with type safety
 */
export const createCsEncryptedColumn = <TData = unknown>(
  name: string,
  config: {
    equality?: boolean
    orderAndRange?: boolean
    freeTextSearch?: boolean
  },
) => {
  return csEncrypted<TData>(name, config)
}

/**
 * Helper function to extract csColumn from a table column
 * This is useful for creating CipherStash schemas
 */
export const extractCsColumn = (column: unknown): ProtectColumn | null => {
  if (isCsEncryptedColumn(column)) {
    return (column as Record<string, () => ProtectColumn>).getCsColumn()
  }
  return null
}

/**
 * Type for CipherStash encrypted columns
 */
export type CsEncryptedColumn<TData = unknown> = ReturnType<
  typeof csEncrypted<TData>
>
