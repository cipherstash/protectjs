import { type Result, withResult } from '@byteslice/result'
import type {
  ProtectClient,
  ProtectTable,
  ProtectTableColumn,
} from '@cipherstash/protect'
import { deepClone, handleError, toEncryptedDynamoItem } from '../helpers'
import type { ProtectDynamoDBError } from '../types'
import {
  DynamoDBOperation,
  type DynamoDBOperationOptions,
} from './base-operation'

export class EncryptModelOperation<
  T extends Record<string, unknown>,
> extends DynamoDBOperation<T> {
  private protectClient: ProtectClient
  private item: T
  private protectTable: ProtectTable<ProtectTableColumn>

  constructor(
    protectClient: ProtectClient,
    item: T,
    protectTable: ProtectTable<ProtectTableColumn>,
    options?: DynamoDBOperationOptions,
  ) {
    super(options)
    this.protectClient = protectClient
    this.item = item
    this.protectTable = protectTable
  }

  public async execute(): Promise<Result<T, ProtectDynamoDBError>> {
    return await withResult(
      async () => {
        const encryptResult = await this.protectClient
          .encryptModel(deepClone(this.item), this.protectTable)
          .audit(this.getAuditData())

        if (encryptResult.failure) {
          // Create an Error object that preserves the FFI error code
          // This is necessary because withResult's ensureError wraps non-Error objects
          const error = new Error(encryptResult.failure.message) as Error & {
            code?: string
          }
          error.code = encryptResult.failure.code
          throw error
        }

        const data = deepClone(encryptResult.data)
        const encryptedAttrs = Object.keys(this.protectTable.build().columns)

        return toEncryptedDynamoItem(data, encryptedAttrs) as T
      },
      (error) =>
        handleError(error, 'encryptModel', {
          logger: this.logger,
          errorHandler: this.errorHandler,
        }),
    )
  }
}
