import { withResult, type Result } from '@byteslice/result'
import { noClientError } from '../index'
import { type ProtectError, ProtectErrorTypes } from '../..'
import { logger } from '../../../../utils/logger'
import type { LockContext } from '../../identify'
import type { Client, Decrypted } from '../../types'
import {
  bulkDecryptModels,
  bulkDecryptModelsWithLockContext,
} from '../model-helpers'

export class BulkDecryptModelsOperation<T extends Record<string, unknown>>
  implements PromiseLike<Result<Array<Decrypted<T>>, ProtectError>>
{
  private client: Client
  private models: Array<T>

  constructor(client: Client, models: Array<T>) {
    this.client = client
    this.models = models
  }

  public withLockContext(
    lockContext: LockContext,
  ): BulkDecryptModelsOperationWithLockContext<T> {
    return new BulkDecryptModelsOperationWithLockContext(this, lockContext)
  }

  public then<
    TResult1 = Result<Array<Decrypted<T>>, ProtectError>,
    TResult2 = never,
  >(
    onfulfilled?:
      | ((
          value: Result<Array<Decrypted<T>>, ProtectError>,
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    // biome-ignore lint/suspicious/noExplicitAny: Rejections require an any type
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<Result<Array<Decrypted<T>>, ProtectError>> {
    logger.debug('Bulk decrypting models WITHOUT a lock context')

    return await withResult(
      async () => {
        if (!this.client) {
          throw noClientError()
        }

        if (!this.models || this.models.length === 0) {
          return []
        }

        return await bulkDecryptModels<T>(this.models, this.client)
      },
      (error) => ({
        type: ProtectErrorTypes.DecryptionError,
        message: error.message,
      }),
    )
  }

  public getOperation(): {
    client: Client
    models: Array<T>
  } {
    return {
      client: this.client,
      models: this.models,
    }
  }
}

export class BulkDecryptModelsOperationWithLockContext<
  T extends Record<string, unknown>,
> implements PromiseLike<Result<Array<Decrypted<T>>, ProtectError>>
{
  private operation: BulkDecryptModelsOperation<T>
  private lockContext: LockContext

  constructor(
    operation: BulkDecryptModelsOperation<T>,
    lockContext: LockContext,
  ) {
    this.operation = operation
    this.lockContext = lockContext
  }

  public then<
    TResult1 = Result<Array<Decrypted<T>>, ProtectError>,
    TResult2 = never,
  >(
    onfulfilled?:
      | ((
          value: Result<Array<Decrypted<T>>, ProtectError>,
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    // biome-ignore lint/suspicious/noExplicitAny: Rejections require an any type
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<Result<Array<Decrypted<T>>, ProtectError>> {
    return await withResult(
      async () => {
        const { client, models } = this.operation.getOperation()

        logger.debug('Bulk decrypting models WITH a lock context')

        if (!client) {
          throw noClientError()
        }

        if (!models || models.length === 0) {
          return []
        }

        const context = await this.lockContext.getLockContext()

        if (context.failure) {
          throw new Error(`[protect]: ${context.failure.message}`)
        }

        return await bulkDecryptModelsWithLockContext<T>(
          models,
          client,
          context.data,
        )
      },
      (error) => ({
        type: ProtectErrorTypes.DecryptionError,
        message: error.message,
      }),
    )
  }
}
