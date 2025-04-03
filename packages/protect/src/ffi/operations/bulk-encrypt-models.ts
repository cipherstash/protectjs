import { newClient } from '@cipherstash/protect-ffi'
import { withResult, type Result } from '@byteslice/result'
import { noClientError } from '../index'
import { type ProtectError, ProtectErrorTypes } from '../..'
import { loadWorkSpaceId } from '../../../../utils/config'
import { logger } from '../../../../utils/logger'
import type { LockContext } from '../../identify'
import type { Client, Decrypted } from '../../types'
import {
  bulkDecryptModels,
  bulkDecryptModelsWithLockContext,
  bulkEncryptModels,
  bulkEncryptModelsWithLockContext,
  decryptModelFields,
  decryptModelFieldsWithLockContext,
  encryptModelFields,
  encryptModelFieldsWithLockContext,
} from '../model-helpers'
import {
  type EncryptConfig,
  encryptConfigSchema,
  type ProtectTable,
  type ProtectTableColumn,
} from '../../schema'

export class BulkEncryptModelsOperation<T extends Record<string, unknown>>
  implements PromiseLike<Result<Array<T>, ProtectError>>
{
  private client: Client
  private models: Array<Decrypted<T>>
  private table: ProtectTable<ProtectTableColumn>

  constructor(
    client: Client,
    models: Array<Decrypted<T>>,
    table: ProtectTable<ProtectTableColumn>,
  ) {
    this.client = client
    this.models = models
    this.table = table
  }

  public withLockContext(
    lockContext: LockContext,
  ): BulkEncryptModelsOperationWithLockContext<T> {
    return new BulkEncryptModelsOperationWithLockContext(this, lockContext)
  }

  public then<TResult1 = Result<Array<T>, ProtectError>, TResult2 = never>(
    onfulfilled?:
      | ((
          value: Result<Array<T>, ProtectError>,
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    // biome-ignore lint/suspicious/noExplicitAny: Rejections require an any type
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<Result<Array<T>, ProtectError>> {
    logger.debug('Bulk encrypting models WITHOUT a lock context', {
      table: this.table.tableName,
    })

    return await withResult(
      async () => {
        if (!this.client) {
          throw noClientError()
        }

        if (!this.models || this.models.length === 0) {
          return []
        }

        return await bulkEncryptModels<T>(this.models, this.table, this.client)
      },
      (error) => ({
        type: ProtectErrorTypes.EncryptionError,
        message: error.message,
      }),
    )
  }

  public getOperation(): {
    client: Client
    models: Array<Decrypted<T>>
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
> implements PromiseLike<Result<Array<T>, ProtectError>>
{
  private operation: BulkEncryptModelsOperation<T>
  private lockContext: LockContext

  constructor(
    operation: BulkEncryptModelsOperation<T>,
    lockContext: LockContext,
  ) {
    this.operation = operation
    this.lockContext = lockContext
  }

  public then<TResult1 = Result<Array<T>, ProtectError>, TResult2 = never>(
    onfulfilled?:
      | ((
          value: Result<Array<T>, ProtectError>,
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    // biome-ignore lint/suspicious/noExplicitAny: Rejections require an any type
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<Result<Array<T>, ProtectError>> {
    return await withResult(
      async () => {
        const { client, models, table } = this.operation.getOperation()

        logger.debug('Bulk encrypting models WITH a lock context', {
          table: table.tableName,
        })

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

        return await bulkEncryptModelsWithLockContext<T>(
          models,
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
