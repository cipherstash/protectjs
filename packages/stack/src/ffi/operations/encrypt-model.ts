import { type Result, withResult } from '@byteslice/result'
import type { EncryptedTable, EncryptedTableColumn } from '@cipherstash/schema'
import { type EncryptionError, EncryptionErrorTypes } from '../..'
import { logger } from '../../../../utils/logger'
import type { LockContext } from '../../identify'
import type { Client, Decrypted } from '../../types'
import { getErrorCode } from '../helpers/error-code'
import { noClientError } from '../index'
import {
  encryptModelFields,
  encryptModelFieldsWithLockContext,
} from '../model-helpers'
import { EncryptionOperation } from './base-operation'

export class EncryptModelOperation<
  T extends Record<string, unknown>,
> extends EncryptionOperation<T> {
  private client: Client
  private model: Decrypted<T>
  private table: EncryptedTable<EncryptedTableColumn>

  constructor(
    client: Client,
    model: Decrypted<T>,
    table: EncryptedTable<EncryptedTableColumn>,
  ) {
    super()
    this.client = client
    this.model = model
    this.table = table
  }

  public withLockContext(
    lockContext: LockContext,
  ): EncryptModelOperationWithLockContext<T> {
    return new EncryptModelOperationWithLockContext(this, lockContext)
  }

  public async execute(): Promise<Result<T, EncryptionError>> {
    logger.debug('Encrypting model WITHOUT a lock context', {
      table: this.table.tableName,
    })

    return await withResult(
      async () => {
        if (!this.client) {
          throw noClientError()
        }

        const auditData = this.getAuditData()

        return await encryptModelFields<T>(
          this.model,
          this.table,
          this.client,
          auditData,
        )
      },
      (error: unknown) => ({
        type: EncryptionErrorTypes.EncryptionError,
        message: (error as Error).message,
        code: getErrorCode(error),
      }),
    )
  }

  public getOperation(): {
    client: Client
    model: Decrypted<T>
    table: EncryptedTable<EncryptedTableColumn>
  } {
    return {
      client: this.client,
      model: this.model,
      table: this.table,
    }
  }
}

export class EncryptModelOperationWithLockContext<
  T extends Record<string, unknown>,
> extends EncryptionOperation<T> {
  private operation: EncryptModelOperation<T>
  private lockContext: LockContext

  constructor(operation: EncryptModelOperation<T>, lockContext: LockContext) {
    super()
    this.operation = operation
    this.lockContext = lockContext
  }

  public async execute(): Promise<Result<T, EncryptionError>> {
    return await withResult(
      async () => {
        const { client, model, table } = this.operation.getOperation()

        logger.debug('Encrypting model WITH a lock context', {
          table: table.tableName,
        })

        if (!client) {
          throw noClientError()
        }

        const context = await this.lockContext.getLockContext()

        if (context.failure) {
          throw new Error(`[protect]: ${context.failure.message}`)
        }

        const auditData = this.getAuditData()

        return await encryptModelFieldsWithLockContext<T>(
          model,
          table,
          client,
          context.data,
          auditData,
        )
      },
      (error: unknown) => ({
        type: EncryptionErrorTypes.EncryptionError,
        message: (error as Error).message,
        code: getErrorCode(error),
      }),
    )
  }
}
