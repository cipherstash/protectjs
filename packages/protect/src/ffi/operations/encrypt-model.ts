import { type Result, withResult } from '@byteslice/result'
import type { EncryptConfig, ProtectTable, ProtectTableColumn } from '@cipherstash/schema'
import { type ProtectError, ProtectErrorTypes } from '../..'
import { logger } from '../../../../utils/logger'
import type { LockContext } from '../../identify'
import type { Client, Decrypted } from '../../types'
import { noClientError } from '../index'
import {
  encryptModelFields,
  encryptModelFieldsWithLockContext,
} from '../model-helpers'
import { ProtectOperation } from './base-operation'

export class EncryptModelOperation<
  T extends Record<string, unknown>,
  C extends EncryptConfig = EncryptConfig,
> extends ProtectOperation<T> {
  private client: Client
  private model: Decrypted<T, C>
  private table: ProtectTable<ProtectTableColumn>

  constructor(
    client: Client,
    model: Decrypted<T, C>,
    table: ProtectTable<ProtectTableColumn>,
  ) {
    super()
    this.client = client
    this.model = model
    this.table = table
  }

  public withLockContext(
    lockContext: LockContext,
  ): EncryptModelOperationWithLockContext<T, C> {
    return new EncryptModelOperationWithLockContext<T, C>(this, lockContext)
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

        const auditData = this.getAuditData()

        return await encryptModelFields<T>(
          this.model,
          this.table,
          this.client,
          auditData,
        )
      },
      (error) => ({
        type: ProtectErrorTypes.EncryptionError,
        message: error.message,
      }),
    )
  }

  public getOperation(): {
    client: Client
    model: Decrypted<T, C>
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
  C extends EncryptConfig = EncryptConfig,
> extends ProtectOperation<T> {
  private operation: EncryptModelOperation<T, C>
  private lockContext: LockContext

  constructor(operation: EncryptModelOperation<T, C>, lockContext: LockContext) {
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

        const auditData = this.getAuditData()

        return await encryptModelFieldsWithLockContext<T>(
          model,
          table,
          client,
          context.data,
          auditData,
        )
      },
      (error) => ({
        type: ProtectErrorTypes.EncryptionError,
        message: error.message,
      }),
    )
  }
}
