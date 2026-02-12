import type {
  Encrypted,
  EncryptedTable,
  EncryptedTableColumn,
  SearchTerm,
} from '@cipherstash/stack'
import { BulkDecryptModelsOperation } from './operations/bulk-decrypt-models'
import { BulkEncryptModelsOperation } from './operations/bulk-encrypt-models'
import { DecryptModelOperation } from './operations/decrypt-model'
import { EncryptModelOperation } from './operations/encrypt-model'
import { SearchTermsOperation } from './operations/search-terms'
import type {
  EncryptedDynamoDBConfig,
  EncryptedDynamoDBInstance,
} from './types'

export function encryptedDynamoDB(
  config: EncryptedDynamoDBConfig,
): EncryptedDynamoDBInstance {
  const { encryptionClient, options } = config

  return {
    encryptModel<T extends Record<string, unknown>>(
      item: T,
      table: EncryptedTable<EncryptedTableColumn>,
    ) {
      return new EncryptModelOperation<T>(
        encryptionClient,
        item,
        table,
        options,
      )
    },

    bulkEncryptModels<T extends Record<string, unknown>>(
      items: T[],
      table: EncryptedTable<EncryptedTableColumn>,
    ) {
      return new BulkEncryptModelsOperation<T>(
        encryptionClient,
        items,
        table,
        options,
      )
    },

    decryptModel<T extends Record<string, unknown>>(
      item: Record<string, Encrypted | unknown>,
      table: EncryptedTable<EncryptedTableColumn>,
    ) {
      return new DecryptModelOperation<T>(
        encryptionClient,
        item,
        table,
        options,
      )
    },

    bulkDecryptModels<T extends Record<string, unknown>>(
      items: Record<string, Encrypted | unknown>[],
      table: EncryptedTable<EncryptedTableColumn>,
    ) {
      return new BulkDecryptModelsOperation<T>(
        encryptionClient,
        items,
        table,
        options,
      )
    },

    /**
     * @deprecated Use `encryptionClient.encryptQuery(terms)` instead and extract the `hm` field for DynamoDB key lookups.
     */
    createSearchTerms(terms: SearchTerm[]) {
      return new SearchTermsOperation(encryptionClient, terms, options)
    },
  }
}

/** @deprecated Use `encryptedDynamoDB` instead. */
export { encryptedDynamoDB as protectDynamoDB }

export * from './types'
