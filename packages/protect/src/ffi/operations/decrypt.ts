import { type Result, withResult } from '@byteslice/result'
import {
  type JsPlaintext,
  decrypt as ffiDecrypt,
} from '@cipherstash/protect-ffi'
import type { EncryptConfig } from '@cipherstash/schema'
import { type ProtectError, ProtectErrorTypes } from '../..'
import { logger } from '../../../../utils/logger'
import type { LockContext } from '../../identify'
import type { Client, Encrypted } from '../../types'
import { noClientError } from '../index'
import { ProtectOperation } from './base-operation'

export class DecryptOperation<
  C extends EncryptConfig = EncryptConfig,
> extends ProtectOperation<JsPlaintext | null> {
  private client: Client
  private encryptedData: Encrypted<C>

  constructor(client: Client, encryptedData: Encrypted<C>) {
    super()
    this.client = client
    this.encryptedData = encryptedData
  }

  public withLockContext(
    lockContext: LockContext,
  ): DecryptOperationWithLockContext<C> {
    return new DecryptOperationWithLockContext<C>(this, lockContext)
  }

  public async execute(): Promise<Result<JsPlaintext | null, ProtectError>> {
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
      (error) => ({
        type: ProtectErrorTypes.DecryptionError,
        message: error.message,
      }),
    )
  }

  public getOperation(): {
    client: Client
    encryptedData: Encrypted<C>
    auditData?: Record<string, unknown>
  } {
    return {
      client: this.client,
      encryptedData: this.encryptedData,
      auditData: this.getAuditData(),
    }
  }
}

export class DecryptOperationWithLockContext<
  C extends EncryptConfig = EncryptConfig,
> extends ProtectOperation<JsPlaintext | null> {
  private operation: DecryptOperation<C>
  private lockContext: LockContext

  constructor(operation: DecryptOperation<C>, lockContext: LockContext) {
    super()
    this.operation = operation
    this.lockContext = lockContext
    const auditData = operation.getAuditData()
    if (auditData) {
      this.audit(auditData)
    }
  }

  public async execute(): Promise<Result<JsPlaintext | null, ProtectError>> {
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
          throw new Error(`[protect]: ${context.failure.message}`)
        }

        return await ffiDecrypt(client, {
          ciphertext: encryptedData,
          unverifiedContext: metadata,
          // biome-ignore lint/suspicious/noExplicitAny: Context type mismatch between local and FFI types
          lockContext: [context.data.context] as any,
          serviceToken: context.data.ctsToken,
        })
      },
      (error) => ({
        type: ProtectErrorTypes.DecryptionError,
        message: error.message,
      }),
    )
  }
}
