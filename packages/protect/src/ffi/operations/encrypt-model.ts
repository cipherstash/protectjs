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
import type { ProtectTable, ProtectTableColumn } from '../../schema'

export class EncryptModelOperation<T extends Record<string, unknown>>
  implements PromiseLike<Result<T, ProtectError>>
{
  private client: Client
  private model: Decrypted<T>
  private table: ProtectTable<ProtectTableColumn>

  constructor(
    client: Client,
    model: Decrypted<T>,
    table: ProtectTable<ProtectTableColumn>,
  ) {
    this.client = client
    this.model = model
    this.table = table
  }

  public withLockContext(
    lockContext: LockContext,
  ): EncryptModelOperationWithLockContext<T> {
    return new EncryptModelOperationWithLockContext(this, lockContext)
  }

  /** Implement the PromiseLike interface so `await` works. */
  public then<TResult1 = Result<T, ProtectError>, TResult2 = never>(
    onfulfilled?:
      | ((value: Result<T, ProtectError>) => TResult1 | PromiseLike<TResult1>)
      | null,
    // biome-ignore lint/suspicious/noExplicitAny: Rejections require an any type
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  /** Actual encryption logic, deferred until `then()` is called. */
  private async execute(): Promise<Result<T, ProtectError>> {
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
> implements PromiseLike<Result<T, ProtectError>>
{
  private operation: EncryptModelOperation<T>
  private lockContext: LockContext

  constructor(operation: EncryptModelOperation<T>, lockContext: LockContext) {
    this.operation = operation
    this.lockContext = lockContext
  }

  public then<TResult1 = Result<T, ProtectError>, TResult2 = never>(
    onfulfilled?:
      | ((value: Result<T, ProtectError>) => TResult1 | PromiseLike<TResult1>)
      | null,
    // biome-ignore lint/suspicious/noExplicitAny: Rejections require an any type
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<Result<T, ProtectError>> {
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
