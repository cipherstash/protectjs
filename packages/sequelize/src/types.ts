import type { MatchIndexOpts, TokenFilter } from '@cipherstash/schema'

/**
 * Configuration for encrypted column indexes and data types
 * Note: columnName is passed separately to createEncryptedType(), not in this config object
 */
export interface EncryptedColumnConfig {
  /**
   * Data type for the column (default: 'string')
   */
  dataType?: 'string' | 'number' | 'json'

  /**
   * Enable equality index. Can be a boolean for default options, or an array of token filters.
   */
  equality?: boolean | TokenFilter[]

  /**
   * Enable free text search. Can be a boolean for default options, or an object for custom configuration.
   */
  freeTextSearch?: boolean | MatchIndexOpts

  /**
   * Enable order and range index for sorting and range queries.
   */
  orderAndRange?: boolean
}
