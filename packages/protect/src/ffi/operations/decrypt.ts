import { decrypt as ffiDecrypt } from '@cipherstash/protect-ffi'
import { withResult, type Result } from '@byteslice/result'
import { noClientError } from '../index'
import { type ProtectError, ProtectErrorTypes } from '../..'
import { logger } from '../../../../utils/logger'
import type { LockContext } from '../../identify'
import type { Client, EncryptedPayload } from '../../types'
import { ProtectOperation } from './base-operation'

export class DecryptOperation extends ProtectOperation<string | null> {
  private client: Client
  private encryptedData: EncryptedPayload

  constructor(client: Client, encryptedData: EncryptedPayload) {
    super()
    this.client = client
    this.encryptedData = encryptedData
  }

  public withLockContext(
    lockContext: LockContext,
  ): DecryptOperationWithLockContext {
    const opWithLock = new DecryptOperationWithLockContext(this, lockContext)
    const auditMetadata = this.getAuditMetadata()
    if (auditMetadata) {
      opWithLock.audit(auditMetadata)
    }
    return opWithLock
  }

  public async execute(): Promise<Result<string | null, ProtectError>> {
    return await withResult(
      async () => {
        if (!this.client) {
          throw noClientError()
        }

        if (this.encryptedData === null) {
          return null
        }

        logger.debug('Decrypting data WITHOUT a lock context', {
          auditMetadata: this.getAuditMetadata(),
        })
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
    auditMetadata?: Record<string, unknown>
  } {
    return {
      client: this.client,
      encryptedData: this.encryptedData,
      auditMetadata: this.getAuditMetadata(),
    }
  }
}

export class DecryptOperationWithLockContext extends ProtectOperation<
  string | null
> {
  private operation: DecryptOperation
  private lockContext: LockContext

  constructor(operation: DecryptOperation, lockContext: LockContext) {
    super()
    this.operation = operation
    this.lockContext = lockContext
    const auditMetadata = operation.getAuditMetadata()
    if (auditMetadata) {
      this.audit(auditMetadata)
    }
  }

  public async execute(): Promise<Result<string | null, ProtectError>> {
    return await withResult(
      async () => {
        const { client, encryptedData } = this.operation.getOperation()

        if (!client) {
          throw noClientError()
        }

        if (encryptedData === null) {
          return null
        }

        logger.debug('Decrypting data WITH a lock context', {
          auditMetadata: this.getAuditMetadata(),
        })

        const context = await this.lockContext.getLockContext()

        if (context.failure) {
          throw new Error(`[protect]: ${context.failure.message}`)
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
