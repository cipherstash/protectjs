import { encrypt as ffiEncrypt } from '@cipherstash/protect-ffi'
import { withResult, type Result } from '@byteslice/result'
import { noClientError } from '../index'
import { type ProtectError, ProtectErrorTypes } from '../..'
import { logger } from '../../../../utils/logger'
import type { LockContext } from '../../identify'
import type {
  Client,
  EncryptedPayload,
  EncryptPayload,
  EncryptOptions,
} from '../../types'
import type {
  ProtectColumn,
  ProtectTable,
  ProtectTableColumn,
} from '../../schema'

export class EncryptOperation
  implements PromiseLike<Result<EncryptedPayload, ProtectError>>
{
  private client: Client
  private plaintext: EncryptPayload
  private column: ProtectColumn
  private table: ProtectTable<ProtectTableColumn>

  constructor(client: Client, plaintext: EncryptPayload, opts: EncryptOptions) {
    this.client = client
    this.plaintext = plaintext
    this.column = opts.column
    this.table = opts.table
  }

  public withLockContext(
    lockContext: LockContext,
  ): EncryptOperationWithLockContext {
    return new EncryptOperationWithLockContext(this, lockContext)
  }

  /** Implement the PromiseLike interface so `await` works. */
  public then<
    TResult1 = Result<EncryptedPayload, ProtectError>,
    TResult2 = never,
  >(
    onfulfilled?:
      | ((
          value: Result<EncryptedPayload, ProtectError>,
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    // biome-ignore lint/suspicious/noExplicitAny: Rejections require an any type
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  /** Actual encryption logic, deferred until `then()` is called. */
  private async execute(): Promise<Result<EncryptedPayload, ProtectError>> {
    logger.debug('Encrypting data WITHOUT a lock context', {
      column: this.column.getName(),
      table: this.table.tableName,
    })

    return await withResult(
      async () => {
        if (!this.client) {
          throw noClientError()
        }

        if (this.plaintext === null) {
          return null
        }

        return await ffiEncrypt(this.client, {
          plaintext: this.plaintext,
          column: this.column.getName(),
          table: this.table.tableName,
        })
      },
      (error) => ({
        type: ProtectErrorTypes.EncryptionError,
        message: error.message,
      }),
    )
  }

  public getOperation(): {
    client: Client
    plaintext: EncryptPayload
    column: ProtectColumn
    table: ProtectTable<ProtectTableColumn>
  } {
    return {
      client: this.client,
      plaintext: this.plaintext,
      column: this.column,
      table: this.table,
    }
  }
}

export class EncryptOperationWithLockContext
  implements PromiseLike<Result<EncryptedPayload, ProtectError>>
{
  private operation: EncryptOperation
  private lockContext: LockContext

  constructor(operation: EncryptOperation, lockContext: LockContext) {
    this.operation = operation
    this.lockContext = lockContext
  }

  public then<
    TResult1 = Result<EncryptedPayload, ProtectError>,
    TResult2 = never,
  >(
    onfulfilled?:
      | ((
          value: Result<EncryptedPayload, ProtectError>,
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    // biome-ignore lint/suspicious/noExplicitAny: Rejections require an any type
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<Result<EncryptedPayload, ProtectError>> {
    return await withResult(
      async () => {
        const { client, plaintext, column, table } =
          this.operation.getOperation()

        logger.debug('Encrypting data WITH a lock context', {
          column: column,
          table: table,
        })

        if (!client) {
          throw noClientError()
        }

        if (plaintext === null) {
          return null
        }

        const context = await this.lockContext.getLockContext()

        if (context.failure) {
          throw new Error(`[protect]: ${context.failure.message}`)
        }

        return await ffiEncrypt(
          client,
          {
            plaintext,
            column: column.getName(),
            table: table.tableName,
            lockContext: context.data.context,
          },
          context.data.ctsToken,
        )
      },
      (error) => ({
        type: ProtectErrorTypes.EncryptionError,
        message: error.message,
      }),
    )
  }
}
