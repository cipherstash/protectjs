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

  public async execute(): Promise<
    Result<Decrypted<T>[], ProtectDynamoDBError>
  > {
    return await withResult(
      async () => {
        const encryptedAttrs = Object.keys(this.protectTable.build().columns)

        const itemsWithEqlPayloads = this.items.map((item) =>
          toItemWithEqlPayloads(item, encryptedAttrs),
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
