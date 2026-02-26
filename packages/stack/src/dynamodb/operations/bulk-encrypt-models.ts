import type { ContractTableRef } from '@/contract'
import type { EncryptionClient } from '@/encryption'
import { logger } from '@/utils/logger'
import { type Result, withResult } from '@byteslice/result'
import { deepClone, handleError, toEncryptedDynamoItem } from '../helpers'
import type { EncryptedDynamoDBError } from '../types'
import {
  DynamoDBOperation,
  type DynamoDBOperationOptions,
} from './base-operation'

export class BulkEncryptModelsOperation<
  T extends Record<string, unknown>,
> extends DynamoDBOperation<T[]> {
  private encryptionClient: EncryptionClient
  private items: T[]
  private tableRef: ContractTableRef

  constructor(
    encryptionClient: EncryptionClient,
    items: T[],
    tableRef: ContractTableRef,
    options?: DynamoDBOperationOptions,
  ) {
    super(options)
    this.encryptionClient = encryptionClient
    this.items = items
    this.tableRef = tableRef
  }

  public async execute(): Promise<Result<T[], EncryptedDynamoDBError>> {
    logger.debug(`DynamoDB: bulk encrypting ${this.items.length} models.`)
    return await withResult(
      async () => {
        const encryptResult = await this.encryptionClient
          .bulkEncryptModels(
            this.items.map((item) => deepClone(item)),
            this.tableRef,
          )
          .audit(this.getAuditData())

        if (encryptResult.failure) {
          const error = new Error(encryptResult.failure.message) as Error & {
            code?: string
          }
          error.code = encryptResult.failure.code
          throw error
        }

        const data = encryptResult.data.map((item) => deepClone(item))
        const encryptedAttrs = Object.keys(this.tableRef._table.build().columns)

        return data.map(
          (encrypted) => toEncryptedDynamoItem(encrypted, encryptedAttrs) as T,
        )
      },
      (error) =>
        handleError(error, 'bulkEncryptModels', {
          logger: this.logger,
          errorHandler: this.errorHandler,
        }),
    )
  }
}
