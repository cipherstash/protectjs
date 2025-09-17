import type { Result } from '@byteslice/result'
import type {
  Decrypted,
  EncryptedPayload,
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
  code: string
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
    item: Record<string, EncryptedPayload | unknown>,
    protectTable: ProtectTable<ProtectTableColumn>,
  ): DecryptModelOperation<T>

  bulkDecryptModels<T extends Record<string, unknown>>(
    items: Record<string, EncryptedPayload | unknown>[],
    protectTable: ProtectTable<ProtectTableColumn>,
  ): BulkDecryptModelsOperation<T>

  createSearchTerms(terms: SearchTerm[]): SearchTermsOperation
}
