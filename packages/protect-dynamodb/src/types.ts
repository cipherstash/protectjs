import type {
  Encrypted,
  ProtectClient,
  ProtectErrorCode,
  ProtectTable,
  ProtectTableColumn,
  SearchTerm,
} from '@cipherstash/protect'
import type { BulkDecryptModelsOperation } from './operations/bulk-decrypt-models'
import type { BulkEncryptModelsOperation } from './operations/bulk-encrypt-models'
import type { DecryptModelOperation } from './operations/decrypt-model'
import type { EncryptModelOperation } from './operations/encrypt-model'
import type { SearchTermsOperation } from './operations/search-terms'

export interface ProtectDynamoDBConfig {
  protectClient: ProtectClient
  options?: {
    logger?: {
      error: (message: string, error: Error) => void
    }
    errorHandler?: (error: ProtectDynamoDBError) => void
  }
}

export interface ProtectDynamoDBError extends Error {
  code: ProtectErrorCode | 'PROTECT_DYNAMODB_ERROR'
  details?: Record<string, unknown>
}

export interface ProtectDynamoDBInstance {
  encryptModel<T extends Record<string, unknown>>(
    item: T,
    protectTable: ProtectTable<ProtectTableColumn>,
  ): EncryptModelOperation<T>

  bulkEncryptModels<T extends Record<string, unknown>>(
    items: T[],
    protectTable: ProtectTable<ProtectTableColumn>,
  ): BulkEncryptModelsOperation<T>

  decryptModel<T extends Record<string, unknown>>(
    item: Record<string, Encrypted | unknown>,
    protectTable: ProtectTable<ProtectTableColumn>,
  ): DecryptModelOperation<T>

  bulkDecryptModels<T extends Record<string, unknown>>(
    items: Record<string, Encrypted | unknown>[],
    protectTable: ProtectTable<ProtectTableColumn>,
  ): BulkDecryptModelsOperation<T>

  /**
   * @deprecated Use `protectClient.encryptQuery(terms)` instead and extract the `hm` field for DynamoDB key lookups.
   *
   * @example
   * ```typescript
   * // Before (deprecated)
   * const result = await protectDynamo.createSearchTerms([{ value, column, table }])
   * const hmac = result.data[0]
   *
   * // After (new API)
   * const [encrypted] = await protectClient.encryptQuery([{ value, column, table, queryType: 'equality' }])
   * const hmac = encrypted.hm
   * ```
   */
  createSearchTerms(terms: SearchTerm[]): SearchTermsOperation
}
