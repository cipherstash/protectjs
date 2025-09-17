import type {
  EncryptedPayload,
  ProtectTable,
  ProtectTableColumn,
  SearchTerm,
} from '@cipherstash/protect'
import { BulkDecryptModelsOperation } from './operations/bulk-decrypt-models'
import { BulkEncryptModelsOperation } from './operations/bulk-encrypt-models'
import { DecryptModelOperation } from './operations/decrypt-model'
import { EncryptModelOperation } from './operations/encrypt-model'
import { SearchTermsOperation } from './operations/search-terms'
import type { ProtectDynamoDBConfig, ProtectDynamoDBInstance } from './types'

export function protectDynamoDB(
  config: ProtectDynamoDBConfig,
): ProtectDynamoDBInstance {
  const { protectClient, options } = config

  return {
    encryptModel<T extends Record<string, unknown>>(
      item: T,
      protectTable: ProtectTable<ProtectTableColumn>,
    ) {
      return new EncryptModelOperation<T>(
        protectClient,
        item,
        protectTable,
        options,
      )
    },

    bulkEncryptModels<T extends Record<string, unknown>>(
      items: T[],
      protectTable: ProtectTable<ProtectTableColumn>,
    ) {
      return new BulkEncryptModelsOperation<T>(
        protectClient,
        items,
        protectTable,
        options,
      )
    },

    decryptModel<T extends Record<string, unknown>>(
      item: Record<string, EncryptedPayload | unknown>,
      protectTable: ProtectTable<ProtectTableColumn>,
    ) {
      return new DecryptModelOperation<T>(
        protectClient,
        item,
        protectTable,
        options,
      )
    },

    bulkDecryptModels<T extends Record<string, unknown>>(
      items: Record<string, EncryptedPayload | unknown>[],
      protectTable: ProtectTable<ProtectTableColumn>,
    ) {
      return new BulkDecryptModelsOperation<T>(
        protectClient,
        items,
        protectTable,
        options,
      )
    },

    createSearchTerms(terms: SearchTerm[]) {
      return new SearchTermsOperation(protectClient, terms, options)
    },
  }
}

export * from './types'
