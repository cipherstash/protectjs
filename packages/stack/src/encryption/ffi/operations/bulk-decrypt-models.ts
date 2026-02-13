import { getErrorCode } from '@/encryption/ffi/helpers/error-code'
import { type EncryptionError, EncryptionErrorTypes } from '@/errors'
import type { LockContext } from '@/identity'
import type { Client, Decrypted } from '@/types'
import { logger } from '@/utils/logger'
import { type Result, withResult } from '@byteslice/result'
import { noClientError } from '../index'
import {
  bulkDecryptModels,
  bulkDecryptModelsWithLockContext,
} from '../model-helpers'
import { EncryptionOperation } from './base-operation'

export class BulkDecryptModelsOperation<
  T extends Record<string, unknown>,
> extends EncryptionOperation<Decrypted<T>[]> {
  private client: Client
  private models: T[]

  constructor(client: Client, models: T[]) {
    super()
    this.client = client
    this.models = models
  }

  public withLockContext(
    lockContext: LockContext,
  ): BulkDecryptModelsOperationWithLockContext<T> {
    return new BulkDecryptModelsOperationWithLockContext(this, lockContext)
  }

  public async execute(): Promise<Result<Decrypted<T>[], EncryptionError>> {
    logger.debug('Bulk decrypting models WITHOUT a lock context')

    return await withResult(
      async () => {
        if (!this.client) {
          throw noClientError()
        }

        const auditData = this.getAuditData()

        return await bulkDecryptModels<T>(this.models, this.client, auditData)
      },
      (error: unknown) => ({
        type: EncryptionErrorTypes.DecryptionError,
        message: (error as Error).message,
        code: getErrorCode(error),
      }),
    )
  }

  public getOperation(): {
    client: Client
    models: T[]
  } {
    return {
      client: this.client,
      models: this.models,
    }
  }
}

export class BulkDecryptModelsOperationWithLockContext<
  T extends Record<string, unknown>,
> extends EncryptionOperation<Decrypted<T>[]> {
  private operation: BulkDecryptModelsOperation<T>
  private lockContext: LockContext

  constructor(
    operation: BulkDecryptModelsOperation<T>,
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

  public async execute(): Promise<Result<Decrypted<T>[], EncryptionError>> {
    return await withResult(
      async () => {
        const { client, models } = this.operation.getOperation()

        logger.debug('Bulk decrypting models WITH a lock context')

        if (!client) {
          throw noClientError()
        }

        const context = await this.lockContext.getLockContext()

        if (context.failure) {
          throw new Error(`[encryption]: ${context.failure.message}`)
        }

        const auditData = this.getAuditData()

        return await bulkDecryptModelsWithLockContext<T>(
          models,
          client,
          context.data,
          auditData,
        )
      },
      (error: unknown) => ({
        type: EncryptionErrorTypes.DecryptionError,
        message: (error as Error).message,
        code: getErrorCode(error),
      }),
    )
  }
}
