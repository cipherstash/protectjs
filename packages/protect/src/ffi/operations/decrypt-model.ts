import { withResult, type Result } from '@byteslice/result'
import { noClientError } from '../index'
import { type ProtectError, ProtectErrorTypes } from '../..'
import { logger } from '../../../../utils/logger'
import type { LockContext } from '../../identify'
import type { Client, Decrypted } from '../../types'
import {
  decryptModelFields,
  decryptModelFieldsWithLockContext,
} from '../model-helpers'
import type { ProtectTable, ProtectTableColumn } from '../../schema'

export class DecryptModelOperation<T extends Record<string, unknown>>
  implements PromiseLike<Result<Decrypted<T>, ProtectError>>
{
  private client: Client
  private model: T
  private table?: ProtectTable<ProtectTableColumn>

  constructor(client: Client, model: T) {
    this.client = client
    this.model = model
  }

  public withLockContext(
    lockContext: LockContext,
  ): DecryptModelOperationWithLockContext<T> {
    return new DecryptModelOperationWithLockContext(this, lockContext)
  }

  public then<TResult1 = Result<Decrypted<T>, ProtectError>, TResult2 = never>(
    onfulfilled?:
      | ((
          value: Result<Decrypted<T>, ProtectError>,
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    // biome-ignore lint/suspicious/noExplicitAny: Rejections require an any type
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<Result<Decrypted<T>, ProtectError>> {
    logger.debug('Decrypting model WITHOUT a lock context')

    return await withResult(
      async () => {
        if (!this.client) {
          throw noClientError()
        }

        return await decryptModelFields<T>(this.model, this.client)
      },
      (error) => ({
        type: ProtectErrorTypes.DecryptionError,
        message: error.message,
      }),
    )
  }

  public getOperation(): {
    client: Client
    model: T
    table?: ProtectTable<ProtectTableColumn>
  } {
    return {
      client: this.client,
      model: this.model,
    }
  }
}

export class DecryptModelOperationWithLockContext<
  T extends Record<string, unknown>,
> implements PromiseLike<Result<Decrypted<T>, ProtectError>>
{
  private operation: DecryptModelOperation<T>
  private lockContext: LockContext

  constructor(operation: DecryptModelOperation<T>, lockContext: LockContext) {
    this.operation = operation
    this.lockContext = lockContext
  }

  public then<TResult1 = Result<Decrypted<T>, ProtectError>, TResult2 = never>(
    onfulfilled?:
      | ((
          value: Result<Decrypted<T>, ProtectError>,
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    // biome-ignore lint/suspicious/noExplicitAny: Rejections require an any type
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<Result<Decrypted<T>, ProtectError>> {
    return await withResult(
      async () => {
        const { client, model } = this.operation.getOperation()

        logger.debug('Decrypting model WITH a lock context')

        if (!client) {
          throw noClientError()
        }

        const context = await this.lockContext.getLockContext()

        if (context.failure) {
          throw new Error(`[protect]: ${context.failure.message}`)
        }

        return await decryptModelFieldsWithLockContext<T>(
          model,
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
