import { type Result, withResult } from '@byteslice/result'
import type {
  Decrypted,
  Encrypted,
  ProtectClient,
  ProtectTable,
  ProtectTableColumn,
} from '@cipherstash/protect'
import { handleError, toItemWithEqlPayloads } from '../helpers'
import type { ProtectDynamoDBError } from '../types'
import {
  DynamoDBOperation,
  type DynamoDBOperationOptions,
} from './base-operation'

/**
 * DynamoDB bulk decryption operation. Restores plaintext values across multiple
 * items while maintaining their original ordering.
 */
export class BulkDecryptModelsOperation<
  T extends Record<string, unknown>,
> extends DynamoDBOperation<Decrypted<T>[]> {
  private protectClient: ProtectClient
  private items: Record<string, Encrypted | unknown>[]
  private protectTable: ProtectTable<ProtectTableColumn>

  constructor(
    protectClient: ProtectClient,
    items: Record<string, Encrypted | unknown>[],
    protectTable: ProtectTable<ProtectTableColumn>,
    options?: DynamoDBOperationOptions,
  ) {
    super(options)
    this.protectClient = protectClient
    this.items = items
    this.protectTable = protectTable
  }

  /**
   * Execute the bulk decryption call and return decrypted copies ready for use
   * in application logic.
   */
  public async execute(): Promise<
    Result<Decrypted<T>[], ProtectDynamoDBError>
  > {
    return await withResult(
      async () => {
        const itemsWithEqlPayloads = this.items.map((item) =>
          toItemWithEqlPayloads(item, this.protectTable),
        )

        const decryptResult = await this.protectClient
          .bulkDecryptModels<T>(itemsWithEqlPayloads as T[])
          .audit(this.getAuditData())

        if (decryptResult.failure) {
          throw new Error(`[protect]: ${decryptResult.failure.message}`)
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
