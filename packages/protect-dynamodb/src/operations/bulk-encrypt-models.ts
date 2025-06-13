import { withResult, type Result } from '@byteslice/result'
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

  public async execute(): Promise<Result<T[], ProtectDynamoDBError>> {
    return await withResult(
      async () => {
        const operation = this.protectClient.bulkEncryptModels(
          this.items.map((item) => deepClone(item)),
          this.protectTable,
        )

        // Apply audit metadata if it exists
        const auditMetadata = this.getAuditMetadata()
        if (auditMetadata) {
          operation.audit({ metadata: auditMetadata })
        }

        const encryptResult = await operation

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
