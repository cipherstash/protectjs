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
 * DynamoDB operation that decrypts a single item back into plaintext form,
 * ready for application consumption.
 */
export class DecryptModelOperation<
  T extends Record<string, unknown>,
> extends DynamoDBOperation<Decrypted<T>> {
  private protectClient: ProtectClient
  private item: Record<string, Encrypted | unknown>
  private protectTable: ProtectTable<ProtectTableColumn>

  constructor(
    protectClient: ProtectClient,
    item: Record<string, Encrypted | unknown>,
    protectTable: ProtectTable<ProtectTableColumn>,
    options?: DynamoDBOperationOptions,
  ) {
    super(options)
    this.protectClient = protectClient
    this.item = item
    this.protectTable = protectTable
  }

  /**
   * Execute the decryption and return the decrypted model or a structured
   * error via the Protect Result contract.
   */
  public async execute(): Promise<Result<Decrypted<T>, ProtectDynamoDBError>> {
    return await withResult(
      async () => {
        const withEqlPayloads = toItemWithEqlPayloads(
          this.item,
          this.protectTable,
        )

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
