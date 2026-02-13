import { getErrorCode } from '@/encryption/ffi/helpers/error-code'
import { type EncryptionError, EncryptionErrorTypes } from '@/errors'
import type { LockContext } from '@/identity'
import type { Client, Decrypted } from '@/types'
import { logger } from '@/utils/logger'
import { type Result, withResult } from '@byteslice/result'
import { noClientError } from '../index'
import {
  decryptModelFields,
  decryptModelFieldsWithLockContext,
} from '../model-helpers'
import { EncryptionOperation } from './base-operation'

export class DecryptModelOperation<
  T extends Record<string, unknown>,
> extends EncryptionOperation<Decrypted<T>> {
  private client: Client
  private model: T

  constructor(client: Client, model: T) {
    super()
    this.client = client
    this.model = model
  }

  public withLockContext(
    lockContext: LockContext,
  ): DecryptModelOperationWithLockContext<T> {
    return new DecryptModelOperationWithLockContext(this, lockContext)
  }

  public async execute(): Promise<Result<Decrypted<T>, EncryptionError>> {
    logger.debug('Decrypting model WITHOUT a lock context')

    return await withResult(
      async () => {
        if (!this.client) {
          throw noClientError()
        }

        const auditData = this.getAuditData()

        return await decryptModelFields<T>(this.model, this.client, auditData)
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
    model: T
  } {
    return {
      client: this.client,
      model: this.model,
    }
  }
}

export class DecryptModelOperationWithLockContext<
  T extends Record<string, unknown>,
> extends EncryptionOperation<Decrypted<T>> {
  private operation: DecryptModelOperation<T>
  private lockContext: LockContext

  constructor(operation: DecryptModelOperation<T>, lockContext: LockContext) {
    super()
    this.operation = operation
    this.lockContext = lockContext
    const auditData = operation.getAuditData()
    if (auditData) {
      this.audit(auditData)
    }
  }

  public async execute(): Promise<Result<Decrypted<T>, EncryptionError>> {
    return await withResult(
      async () => {
        const { client, model } = this.operation.getOperation()

        logger.debug('Decrypting model WITH a lock context')

        if (!client) {
          throw noClientError()
        }

        const context = await this.lockContext.getLockContext()

        if (context.failure) {
          throw new Error(`[encryption]: ${context.failure.message}`)
        }

        const auditData = this.getAuditData()

        return await decryptModelFieldsWithLockContext<T>(
          model,
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
