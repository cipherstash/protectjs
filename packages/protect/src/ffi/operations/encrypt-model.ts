import { withResult, type Result } from '@byteslice/result'
import { noClientError } from '../index'
import { type ProtectError, ProtectErrorTypes } from '../..'
import { logger } from '../../../../utils/logger'
import type { LockContext } from '../../identify'
import type { Client, Decrypted } from '../../types'
import {
  encryptModelFields,
  encryptModelFieldsWithLockContext,
} from '../model-helpers'
import type { ProtectTable, ProtectTableColumn } from '@cipherstash/schema'
import { ProtectOperation } from './base-operation'

export class EncryptModelOperation<
  T extends Record<string, unknown>,
> extends ProtectOperation<T> {
  private client: Client
  private model: Decrypted<T>
  private table: ProtectTable<ProtectTableColumn>

  constructor(
    client: Client,
    model: Decrypted<T>,
    table: ProtectTable<ProtectTableColumn>,
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

  public async execute(): Promise<Result<T, ProtectError>> {
    logger.debug('Encrypting model WITHOUT a lock context', {
      table: this.table.tableName,
    })

    return await withResult(
      async () => {
        if (!this.client) {
          throw noClientError()
        }

        return await encryptModelFields<T>(this.model, this.table, this.client)
      },
      (error) => ({
        type: ProtectErrorTypes.EncryptionError,
        message: error.message,
      }),
    )
  }

  public getOperation(): {
    client: Client
    model: Decrypted<T>
    table: ProtectTable<ProtectTableColumn>
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
> extends ProtectOperation<T> {
  private operation: EncryptModelOperation<T>
  private lockContext: LockContext

  constructor(operation: EncryptModelOperation<T>, lockContext: LockContext) {
    super()
    this.operation = operation
    this.lockContext = lockContext
  }

  public async execute(): Promise<Result<T, ProtectError>> {
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

        return await encryptModelFieldsWithLockContext<T>(
          model,
          table,
          client,
          context.data,
        )
      },
      (error) => ({
        type: ProtectErrorTypes.EncryptionError,
        message: error.message,
      }),
    )
  }
}
