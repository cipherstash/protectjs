import { newClient, decrypt as ffiDecrypt } from '@cipherstash/protect-ffi'
import { withResult, type Result } from '@byteslice/result'
import { noClientError } from '../index'
import { type ProtectError, ProtectErrorTypes } from '../..'
import { logger } from '../../../../utils/logger'
import type { LockContext } from '../../identify'
import type { Client, EncryptedPayload } from '../../types'

export class DecryptOperation
  implements PromiseLike<Result<string | null, ProtectError>>
{
  private client: Client
  private encryptedData: EncryptedPayload

  constructor(client: Client, encryptedData: EncryptedPayload) {
    this.client = client
    this.encryptedData = encryptedData
  }

  public withLockContext(
    lockContext: LockContext,
  ): DecryptOperationWithLockContext {
    return new DecryptOperationWithLockContext(this, lockContext)
  }

  public then<TResult1 = Result<string | null, ProtectError>, TResult2 = never>(
    onfulfilled?:
      | ((
          value: Result<string | null, ProtectError>,
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    // biome-ignore lint/suspicious/noExplicitAny: Rejections require an any type
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<Result<string | null, ProtectError>> {
    return await withResult(
      async () => {
        if (!this.client) {
          throw noClientError()
        }

        if (this.encryptedData === null) {
          return null
        }

        if (this.encryptedData.k !== 'ct') {
          throw new Error(
            'The encrypted data is not compliant with the EQL schema',
          )
        }

        logger.debug('Decrypting data WITHOUT a lock context')
        return await ffiDecrypt(this.client, this.encryptedData.c)
      },
      (error) => ({
        type: ProtectErrorTypes.DecryptionError,
        message: error.message,
      }),
    )
  }

  public getOperation(): {
    client: Client
    encryptedData: EncryptedPayload
  } {
    return {
      client: this.client,
      encryptedData: this.encryptedData,
    }
  }
}

export class DecryptOperationWithLockContext
  implements PromiseLike<Result<string | null, ProtectError>>
{
  private operation: DecryptOperation
  private lockContext: LockContext

  constructor(operation: DecryptOperation, lockContext: LockContext) {
    this.operation = operation
    this.lockContext = lockContext
  }

  public then<TResult1 = Result<string | null, ProtectError>, TResult2 = never>(
    onfulfilled?:
      | ((
          value: Result<string | null, ProtectError>,
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    // biome-ignore lint/suspicious/noExplicitAny: Rejections require an any type
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<Result<string | null, ProtectError>> {
    return await withResult(
      async () => {
        const { client, encryptedData } = this.operation.getOperation()

        if (!client) {
          throw noClientError()
        }

        if (encryptedData === null) {
          return null
        }

        logger.debug('Decrypting data WITH a lock context')

        const context = await this.lockContext.getLockContext()

        if (context.failure) {
          throw new Error(`[protect]: ${context.failure.message}`)
        }

        if (encryptedData.k !== 'ct') {
          throw new Error(
            'The encrypted data is not compliant with the EQL schema',
          )
        }

        return await ffiDecrypt(
          client,
          encryptedData.c,
          context.data.context,
          context.data.ctsToken,
        )
      },
      (error) => ({
        type: ProtectErrorTypes.DecryptionError,
        message: error.message,
      }),
    )
  }
}
