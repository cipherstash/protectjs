import { type Result, withResult } from '@byteslice/result'
import type {
  Decrypted,
  Encrypted,
  EncryptedTable,
  EncryptedTableColumn,
  EncryptionClient,
} from '@cipherstash/stack'
import { handleError, toItemWithEqlPayloads } from '../helpers'
import type { EncryptedDynamoDBError } from '../types'
import {
  DynamoDBOperation,
  type DynamoDBOperationOptions,
} from './base-operation'

export class BulkDecryptModelsOperation<
  T extends Record<string, unknown>,
> extends DynamoDBOperation<Decrypted<T>[]> {
  private encryptionClient: EncryptionClient
  private items: Record<string, Encrypted | unknown>[]
  private table: EncryptedTable<EncryptedTableColumn>

  constructor(
    encryptionClient: EncryptionClient,
    items: Record<string, Encrypted | unknown>[],
    table: EncryptedTable<EncryptedTableColumn>,
    options?: DynamoDBOperationOptions,
  ) {
    super(options)
    this.encryptionClient = encryptionClient
    this.items = items
    this.table = table
  }

  public async execute(): Promise<
    Result<Decrypted<T>[], EncryptedDynamoDBError>
  > {
    return await withResult(
      async () => {
        const itemsWithEqlPayloads = this.items.map((item) =>
          toItemWithEqlPayloads(item, this.table),
        )

        const decryptResult = await this.encryptionClient
          .bulkDecryptModels<T>(itemsWithEqlPayloads as T[])
          .audit(this.getAuditData())

        if (decryptResult.failure) {
          // Create an Error object that preserves the FFI error code
          // This is necessary because withResult's ensureError wraps non-Error objects
          const error = new Error(decryptResult.failure.message) as Error & {
            code?: string
          }
          error.code = decryptResult.failure.code
          throw error
        }

        return decryptResult.data
      },
      (error) =>
        handleError(error, 'bulkDecryptModels', {
          logger: this.logger,
          errorHandler: this.errorHandler,
        }),
    )
  }
}
