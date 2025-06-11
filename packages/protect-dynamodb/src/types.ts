import type {
  ProtectClient,
  Decrypted,
  ProtectTable,
  ProtectTableColumn,
  EncryptedPayload,
  SearchTerm,
} from '@cipherstash/protect'
import type { Result } from '@byteslice/result'

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
  ): Promise<Result<T, ProtectDynamoDBError>>

  bulkEncryptModels<T extends Record<string, unknown>>(
    items: T[],
    protectTable: ProtectTable<ProtectTableColumn>,
  ): Promise<Result<T[], ProtectDynamoDBError>>

  decryptModel<T extends Record<string, unknown>>(
    item: T,
    protectTable: ProtectTable<ProtectTableColumn>,
  ): Promise<Result<Decrypted<T>, ProtectDynamoDBError>>

  bulkDecryptModels<T extends Record<string, unknown>>(
    items: T[],
    protectTable: ProtectTable<ProtectTableColumn>,
  ): Promise<Result<Decrypted<T>[], ProtectDynamoDBError>>

  createSearchTerms(
    terms: SearchTerm[],
  ): Promise<Result<string[], ProtectDynamoDBError>>
}
