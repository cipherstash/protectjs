import { withResult, type Result } from '@byteslice/result'
import type {
  ProtectClient,
  ProtectTable,
  ProtectTableColumn,
  Decrypted,
  EncryptedPayload,
} from '@cipherstash/protect'
import { handleError, toItemWithEqlPayloads } from '../helpers'
import type { ProtectDynamoDBError } from '../types'
import {
  DynamoDBOperation,
  type DynamoDBOperationOptions,
} from './base-operation'

export class DecryptModelOperation<
  T extends Record<string, unknown>,
> extends DynamoDBOperation<Decrypted<T>> {
  private protectClient: ProtectClient
  private item: Record<string, EncryptedPayload | unknown>
  private protectTable: ProtectTable<ProtectTableColumn>

  constructor(
    protectClient: ProtectClient,
    item: Record<string, EncryptedPayload | unknown>,
    protectTable: ProtectTable<ProtectTableColumn>,
    options?: DynamoDBOperationOptions,
  ) {
    super(options)
    this.protectClient = protectClient
    this.item = item
    this.protectTable = protectTable
  }

  public async execute(): Promise<Result<Decrypted<T>, ProtectDynamoDBError>> {
    return await withResult(
      async () => {
        const encryptedAttrs = Object.keys(this.protectTable.build().columns)
        const withEqlPayloads = toItemWithEqlPayloads(this.item, encryptedAttrs)

        const decryptResult = await this.protectClient
          .decryptModel<T>(withEqlPayloads as T)
          .audit(this.getAuditData())

        if (decryptResult.failure) {
          throw new Error(`[protect]: ${decryptResult.failure.message}`)
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
