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

/**
 * DynamoDB bulk encryption operation. Encrypts multiple items in one ZeroKMS
 * round-trip while respecting DynamoDB-specific shape requirements.
 */
export class BulkEncryptModelsOperation<
  T extends Record<string, unknown>,
> extends DynamoDBOperation<T[]> {
  private protectClient: ProtectClient
  private items: T[]
  private protectTable: ProtectTable<ProtectTableColumn>

  constructor(
    protectClient: ProtectClient,
    items: T[],
    protectTable: ProtectTable<ProtectTableColumn>,
    options?: DynamoDBOperationOptions,
  ) {
    super(options)
    this.protectClient = protectClient
    this.items = items
    this.protectTable = protectTable
  }

  /**
   * Execute the bulk encryption call and return DynamoDB-friendly payloads
   * alongside any captured audit metadata.
   */
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
