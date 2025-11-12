import type {
  Encrypted,
  ProtectClient,
  ProtectTable,
  ProtectTableColumn,
  SearchTerm,
} from '@cipherstash/protect'
import type { BulkDecryptModelsOperation } from './operations/bulk-decrypt-models'
import type { BulkEncryptModelsOperation } from './operations/bulk-encrypt-models'
import type { DecryptModelOperation } from './operations/decrypt-model'
import type { EncryptModelOperation } from './operations/encrypt-model'
import type { SearchTermsOperation } from './operations/search-terms'

/**
 * Configuration contract for {@link protectDynamoDB}. Supply an initialised
 * Protect client and optionally customise logging or error handling hooks for
 * your AWS environment.
 */
export interface ProtectDynamoDBConfig {
  protectClient: ProtectClient
  options?: {
    logger?: {
      error: (message: string, error: Error) => void
    }
    errorHandler?: (error: ProtectDynamoDBError) => void
  }
}

/**
 * Standard error shape emitted by DynamoDB helpers. Surface the error code and
 * optional context so you can forward telemetry to operational tooling.
 */
export interface ProtectDynamoDBError extends Error {
  code: string
  details?: Record<string, unknown>
}

/**
 * Protect.js façade tailored for DynamoDB use-cases. Mirrors the core client
 * API while adapting payloads for DynamoDB item structures.
 */
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

  createSearchTerms(terms: SearchTerm[]): SearchTermsOperation
}
