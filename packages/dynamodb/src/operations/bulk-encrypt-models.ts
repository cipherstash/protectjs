import { type Result, withResult } from '@byteslice/result'
import type {
  EncryptionClient,
  ProtectTable,
  ProtectTableColumn,
} from '@cipherstash/stack'
import { deepClone, handleError, toEncryptedDynamoItem } from '../helpers'
import type { ProtectDynamoDBError } from '../types'
import {
  DynamoDBOperation,
  type DynamoDBOperationOptions,
} from './base-operation'

export class BulkEncryptModelsOperation<
  T extends Record<string, unknown>,
> extends DynamoDBOperation<T[]> {
  private protectClient: EncryptionClient
  private items: T[]
  private protectTable: EncryptedTable<EncryptedTableColumn>

  constructor(
    protectClient: EncryptionClient,
    items: T[],
    protectTable: EncryptedTable<EncryptedTableColumn>,
    options?: DynamoDBOperationOptions,
  ) {
    super(options)
    this.protectClient = protectClient
    this.items = items
    this.protectTable = protectTable
  }

  public async execute(): Promise<Result<T[], ProtectDynamoDBError>> {
    return await withResult(
      async () => {
        const encryptResult = await this.protectClient
          .bulkEncryptModels(
            this.items.map((item) => deepClone(item)),
            this.protectTable,
          )
          .audit(this.getAuditData())

        if (encryptResult.failure) {
          throw new Error(`encryption error: ${encryptResult.failure.message}`)
        }

        const data = encryptResult.data.map((item) => deepClone(item))
        const encryptedAttrs = Object.keys(this.protectTable.build().columns)

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
