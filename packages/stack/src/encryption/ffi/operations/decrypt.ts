import { getErrorCode } from '@/encryption/ffi/helpers/error-code'
import { type EncryptionError, EncryptionErrorTypes } from '@/errors'
import type { LockContext } from '@/identity'
import type { Client, Encrypted } from '@/types'
import { logger } from '@/utils/logger'
import { type Result, withResult } from '@byteslice/result'
import {
  type JsPlaintext,
  decrypt as ffiDecrypt,
} from '@cipherstash/protect-ffi'
import { noClientError } from '../index'
import { EncryptionOperation } from './base-operation'

/**
 * Decrypts an encrypted payload using the provided client.
 * This is the type returned by the {@link EncryptionClient.decrypt | decrypt} method of the {@link EncryptionClient}.
 */
export class DecryptOperation extends EncryptionOperation<JsPlaintext | null> {
  private client: Client
  private encryptedData: Encrypted

  constructor(client: Client, encryptedData: Encrypted) {
    super()
    this.client = client
    this.encryptedData = encryptedData
  }

  public withLockContext(
    lockContext: LockContext,
  ): DecryptOperationWithLockContext {
    return new DecryptOperationWithLockContext(this, lockContext)
  }

  public async execute(): Promise<Result<JsPlaintext | null, EncryptionError>> {
    return await withResult(
      async () => {
        if (!this.client) {
          throw noClientError()
        }

        if (this.encryptedData === null) {
          return null
        }

        const { metadata } = this.getAuditData()

        logger.debug('Decrypting data WITHOUT a lock context', {
          metadata,
        })

        return await ffiDecrypt(this.client, {
          ciphertext: this.encryptedData,
          unverifiedContext: metadata,
        })
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
    encryptedData: Encrypted
    auditData?: Record<string, unknown>
  } {
    return {
      client: this.client,
      encryptedData: this.encryptedData,
      auditData: this.getAuditData(),
    }
  }
}

export class DecryptOperationWithLockContext extends EncryptionOperation<JsPlaintext | null> {
  private operation: DecryptOperation
  private lockContext: LockContext

  constructor(operation: DecryptOperation, lockContext: LockContext) {
    super()
    this.operation = operation
    this.lockContext = lockContext
    const auditData = operation.getAuditData()
    if (auditData) {
      this.audit(auditData)
    }
  }

  public async execute(): Promise<Result<JsPlaintext | null, EncryptionError>> {
    return await withResult(
      async () => {
        const { client, encryptedData } = this.operation.getOperation()

        if (!client) {
          throw noClientError()
        }

        if (encryptedData === null) {
          return null
        }

        const { metadata } = this.getAuditData()

        logger.debug('Decrypting data WITH a lock context', {
          metadata,
        })

        const context = await this.lockContext.getLockContext()

        if (context.failure) {
          throw new Error(`[encryption]: ${context.failure.message}`)
        }

        return await ffiDecrypt(client, {
          ciphertext: encryptedData,
          unverifiedContext: metadata,
          lockContext: context.data.context,
          serviceToken: context.data.ctsToken,
        })
      },
      (error: unknown) => ({
        type: EncryptionErrorTypes.DecryptionError,
        message: (error as Error).message,
        code: getErrorCode(error),
      }),
    )
  }
}
