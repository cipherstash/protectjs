import { getErrorCode } from '@/encryption/ffi/helpers/error-code'
import { type EncryptionError, EncryptionErrorTypes } from '@/errors'
import type { LockContext } from '@/identity'
import type { ProtectTable, ProtectTableColumn } from '@/schema'
import type { Client, Decrypted } from '@/types'
import { createRequestLogger } from '@/utils/logger'
import { type Result, withResult } from '@byteslice/result'
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
  private table: ProtectTable<ProtectTableColumn>

  constructor(
    client: Client,
    models: Decrypted<T>[],
    table: ProtectTable<ProtectTableColumn>,
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
    const log = createRequestLogger()
    log.set({
      op: 'bulkEncryptModels',
      table: this.table.tableName,
      count: this.models.length,
      lockContext: false,
    })

    const result = await withResult(
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
      (error: unknown) => {
        log.set({ errorCode: getErrorCode(error) ?? 'unknown' })
        return {
          type: EncryptionErrorTypes.EncryptionError,
          message: (error as Error).message,
          code: getErrorCode(error),
        }
      },
    )
    log.emit()
    return result
  }

  public getOperation(): {
    client: Client
    models: Decrypted<T>[]
    table: ProtectTable<ProtectTableColumn>
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
    const auditData = operation.getAuditData()
    if (auditData) {
      this.audit(auditData)
    }
  }

  public async execute(): Promise<Result<T[], EncryptionError>> {
    const { client, models, table } = this.operation.getOperation()

    const log = createRequestLogger()
    log.set({
      op: 'bulkEncryptModels',
      table: table.tableName,
      count: models.length,
      lockContext: true,
    })

    const result = await withResult(
      async () => {
        if (!client) {
          throw noClientError()
        }

        const context = await this.lockContext.getLockContext()

        if (context.failure) {
          throw new Error(`[encryption]: ${context.failure.message}`)
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
      (error: unknown) => {
        log.set({ errorCode: getErrorCode(error) ?? 'unknown' })
        return {
          type: EncryptionErrorTypes.EncryptionError,
          message: (error as Error).message,
          code: getErrorCode(error),
        }
      },
    )
    log.emit()
    return result
  }
}
