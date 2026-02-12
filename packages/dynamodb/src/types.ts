import type {
  Encrypted,
  EncryptedTable,
  EncryptedTableColumn,
  EncryptionClient,
  ProtectErrorCode,
  SearchTerm,
} from '@cipherstash/stack'
import type { BulkDecryptModelsOperation } from './operations/bulk-decrypt-models'
import type { BulkEncryptModelsOperation } from './operations/bulk-encrypt-models'
import type { DecryptModelOperation } from './operations/decrypt-model'
import type { EncryptModelOperation } from './operations/encrypt-model'
import type { SearchTermsOperation } from './operations/search-terms'

export interface EncryptedDynamoDBConfig {
  encryptionClient: EncryptionClient
  options?: {
    logger?: {
      error: (message: string, error: Error) => void
    }
    errorHandler?: (error: EncryptedDynamoDBError) => void
  }
}

export interface EncryptedDynamoDBError extends Error {
  code: ProtectErrorCode | 'DYNAMODB_ENCRYPTION_ERROR'
  details?: Record<string, unknown>
}

export interface EncryptedDynamoDBInstance {
  encryptModel<T extends Record<string, unknown>>(
    item: T,
    protectTable: EncryptedTable<EncryptedTableColumn>,
  ): EncryptModelOperation<T>

  bulkEncryptModels<T extends Record<string, unknown>>(
    items: T[],
    protectTable: EncryptedTable<EncryptedTableColumn>,
  ): BulkEncryptModelsOperation<T>

  decryptModel<T extends Record<string, unknown>>(
    item: Record<string, Encrypted | unknown>,
    protectTable: EncryptedTable<EncryptedTableColumn>,
  ): DecryptModelOperation<T>

  bulkDecryptModels<T extends Record<string, unknown>>(
    items: Record<string, Encrypted | unknown>[],
    protectTable: EncryptedTable<EncryptedTableColumn>,
  ): BulkDecryptModelsOperation<T>

  /**
   * @deprecated Use `encryptionClient.encryptQuery(terms)` instead and extract the `hm` field for DynamoDB key lookups.
   *
   * @example
   * ```typescript
   * // Before (deprecated)
   * const result = await protectDynamo.createSearchTerms([{ value, column, table }])
   * const hmac = result.data[0]
   *
   * // After (new API)
   * const [encrypted] = await encryptionClient.encryptQuery([{ value, column, table, queryType: 'equality' }])
   * const hmac = encrypted.hm
   * ```
   */
  createSearchTerms(terms: SearchTerm[]): SearchTermsOperation
}

/** @deprecated Use `EncryptedDynamoDBConfig` instead. */
export type ProtectDynamoDBConfig = EncryptedDynamoDBConfig
/** @deprecated Use `EncryptedDynamoDBError` instead. */
export type ProtectDynamoDBError = EncryptedDynamoDBError
/** @deprecated Use `EncryptedDynamoDBInstance` instead. */
export type ProtectDynamoDBInstance = EncryptedDynamoDBInstance
/** @deprecated Use `'DYNAMODB_ENCRYPTION_ERROR'` instead. */
export const PROTECT_DYNAMODB_ERROR = 'DYNAMODB_ENCRYPTION_ERROR' as const
