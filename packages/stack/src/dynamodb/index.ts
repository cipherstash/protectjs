import type { ContractTableRef } from '@/contract'
import type { EncryptedValue } from '@/types'
import { BulkDecryptModelsOperation } from './operations/bulk-decrypt-models'
import { BulkEncryptModelsOperation } from './operations/bulk-encrypt-models'
import { DecryptModelOperation } from './operations/decrypt-model'
import { EncryptModelOperation } from './operations/encrypt-model'
import type {
  EncryptedDynamoDBConfig,
  EncryptedDynamoDBInstance,
} from './types'

/**
 * Create an encrypted DynamoDB helper bound to an `EncryptionClient`.
 *
 * Returns an object with `encryptModel`, `decryptModel`, `bulkEncryptModels`,
 * and `bulkDecryptModels` methods that transparently encrypt/decrypt DynamoDB
 * items according to the provided contract table reference.
 *
 * @param config - Configuration containing the `encryptionClient` and optional
 *   logging / error-handling callbacks.
 * @returns An {@link EncryptedDynamoDBInstance} with encrypt/decrypt operations.
 *
 * @example
 * ```typescript
 * import { Encryption, defineContract } from "@cipherstash/stack"
 * import { encryptedDynamoDB } from "@cipherstash/stack/dynamodb"
 *
 * const contract = defineContract({
 *   users: {
 *     email: { type: 'string', equality: true },
 *   },
 * })
 *
 * const client = await Encryption({ contract })
 * const dynamo = encryptedDynamoDB({ encryptionClient: client })
 *
 * const encrypted = await dynamo.encryptModel({ email: "a@b.com" }, contract.users)
 * ```
 */
export function encryptedDynamoDB(
  config: EncryptedDynamoDBConfig,
): EncryptedDynamoDBInstance {
  const { encryptionClient, options } = config

  return {
    encryptModel<T extends Record<string, unknown>>(
      item: T,
      table: ContractTableRef,
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
      table: ContractTableRef,
    ) {
      return new BulkEncryptModelsOperation<T>(
        encryptionClient,
        items,
        table,
        options,
      )
    },

    decryptModel<T extends Record<string, unknown>>(
      item: Record<string, EncryptedValue | unknown>,
      table: ContractTableRef,
    ) {
      return new DecryptModelOperation<T>(
        encryptionClient,
        item,
        table,
        options,
      )
    },

    bulkDecryptModels<T extends Record<string, unknown>>(
      items: Record<string, EncryptedValue | unknown>[],
      table: ContractTableRef,
    ) {
      return new BulkDecryptModelsOperation<T>(
        encryptionClient,
        items,
        table,
        options,
      )
    },
  }
}

export type {
  EncryptedDynamoDBConfig,
  EncryptedDynamoDBError,
  EncryptedDynamoDBInstance,
} from './types'
