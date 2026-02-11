import { type Result, withResult } from '@byteslice/result'
import type { EncryptedTable, EncryptedTableColumn } from '@cipherstash/schema'
import { type EncryptionError, EncryptionErrorTypes } from '../..'
import { logger } from '../../../../utils/logger'
import type { LockContext } from '../../identify'
import type { Client, Decrypted } from '../../types'
import { noClientError } from '../index'
import {
  bulkEncryptModels,
  bulkEncryptModelsWithLockContext,
} from '../model-helpers'
import { EncryptionOperation } from './base-operation'

export class BulkEncryptModelsOperation<
  T extends Record<string, unknown>,
> extends EncryptionOperation<T[]> {
  private client: Client
  private models: Decrypted<T>[]
  private table: EncryptedTable<EncryptedTableColumn>

  constructor(
    client: Client,
    models: Decrypted<T>[],
    table: EncryptedTable<EncryptedTableColumn>,
  ) {
    super()
    this.client = client
    this.models = models
    this.table = table
  }

  public withLockContext(
    lockContext: LockContext,
  ): BulkEncryptModelsOperationWithLockContext<T> {
    return new BulkEncryptModelsOperationWithLockContext(this, lockContext)
  }

  public async execute(): Promise<Result<T[], EncryptionError>> {
    logger.debug('Bulk encrypting models WITHOUT a lock context', {
      table: this.table.tableName,
    })

    return await withResult(
      async () => {
        if (!this.client) {
          throw noClientError()
        }

        const auditData = this.getAuditData()

        return await bulkEncryptModels<T>(
          this.models,
          this.table,
          this.client,
          auditData,
        )
      },
      (error) => ({
        type: EncryptionErrorTypes.EncryptionError,
        message: error.message,
      }),
    )
  }

  public getOperation(): {
    client: Client
    models: Decrypted<T>[]
    table: EncryptedTable<EncryptedTableColumn>
  } {
    return {
      client: this.client,
      models: this.models,
      table: this.table,
    }
  }
}

export class BulkEncryptModelsOperationWithLockContext<
  T extends Record<string, unknown>,
> extends EncryptionOperation<T[]> {
  private operation: BulkEncryptModelsOperation<T>
  private lockContext: LockContext

  constructor(
    operation: BulkEncryptModelsOperation<T>,
    lockContext: LockContext,
  ) {
    super()
    this.operation = operation
    this.lockContext = lockContext
  }

  public async execute(): Promise<Result<T[], EncryptionError>> {
    return await withResult(
      async () => {
        const { client, models, table } = this.operation.getOperation()

        logger.debug('Bulk encrypting models WITH a lock context', {
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

        return await bulkEncryptModelsWithLockContext<T>(
          models,
          table,
          client,
          context.data,
          auditData,
        )
      },
      (error) => ({
        type: EncryptionErrorTypes.EncryptionError,
        message: error.message,
      }),
    )
  }
}
