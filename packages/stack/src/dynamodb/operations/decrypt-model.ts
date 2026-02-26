import type { ContractTableRef } from '@/contract'
import type { EncryptionClient } from '@/encryption'
import type { Decrypted, EncryptedValue } from '@/types'
import { logger } from '@/utils/logger'
import { type Result, withResult } from '@byteslice/result'
import { handleError, toItemWithEqlPayloads } from '../helpers'
import type { EncryptedDynamoDBError } from '../types'
import {
  DynamoDBOperation,
  type DynamoDBOperationOptions,
} from './base-operation'

export class DecryptModelOperation<
  T extends Record<string, unknown>,
> extends DynamoDBOperation<Decrypted<T>> {
  private encryptionClient: EncryptionClient
  private item: Record<string, EncryptedValue | unknown>
  private tableRef: ContractTableRef

  constructor(
    encryptionClient: EncryptionClient,
    item: Record<string, EncryptedValue | unknown>,
    tableRef: ContractTableRef,
    options?: DynamoDBOperationOptions,
  ) {
    super(options)
    this.encryptionClient = encryptionClient
    this.item = item
    this.tableRef = tableRef
  }

  public async execute(): Promise<
    Result<Decrypted<T>, EncryptedDynamoDBError>
  > {
    logger.debug('DynamoDB: decrypting model.')
    return await withResult(
      async () => {
        const withEqlPayloads = toItemWithEqlPayloads(this.item, this.tableRef._table)

        const decryptResult = await this.encryptionClient
          .decryptModel<T>(withEqlPayloads as T)
          .audit(this.getAuditData())

        if (decryptResult.failure) {
          const error = new Error(decryptResult.failure.message) as Error & {
            code?: string
          }
          error.code = decryptResult.failure.code
          throw error
        }

        return decryptResult.data
      },
      (error) =>
        handleError(error, 'decryptModel', {
          logger: this.logger,
          errorHandler: this.errorHandler,
        }),
    )
  }
}
