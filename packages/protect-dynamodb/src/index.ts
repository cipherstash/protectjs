import type {
  Encrypted,
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

/**
 * Create a DynamoDB-flavoured façade over a configured {@link ProtectClient}.
 * The returned helpers mirror the core Protect.js API but adapt payload shapes
 * for AWS DynamoDB’s attribute model.
 *
 * @param config - Client instance and optional logging/error hooks.
 */
export function protectDynamoDB(
  config: ProtectDynamoDBConfig,
): ProtectDynamoDBInstance {
  const { protectClient, options } = config

  return {
    /**
     * Encrypt a single DynamoDB item according to the supplied Protect table.
     * Resulting attributes are transformed into DynamoDB-friendly ciphertext
     * fields.
     */
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

    /**
     * Encrypt multiple DynamoDB items in one request for efficient ingestion or
     * migration workloads.
     */
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

    /**
     * Decrypt a single DynamoDB item, converting ciphertext attributes back to
     * plaintext while leaving untouched fields as-is.
     */
    decryptModel<T extends Record<string, unknown>>(
      item: Record<string, Encrypted | unknown>,
      protectTable: ProtectTable<ProtectTableColumn>,
    ) {
      return new DecryptModelOperation<T>(
        protectClient,
        item,
        protectTable,
        options,
      )
    },

    /**
     * Decrypt multiple DynamoDB items in one request. Each result preserves the
     * order of the provided array.
     */
    bulkDecryptModels<T extends Record<string, unknown>>(
      items: Record<string, Encrypted | unknown>[],
      protectTable: ProtectTable<ProtectTableColumn>,
    ) {
      return new BulkDecryptModelsOperation<T>(
        protectClient,
        items,
        protectTable,
        options,
      )
    },

    /**
     * Generate encrypted search terms compatible with DynamoDB secondary index
     * strategies.
     */
    createSearchTerms(terms: SearchTerm[]) {
      return new SearchTermsOperation(protectClient, terms, options)
    },
  }
}

export * from './types'
