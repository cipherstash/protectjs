import { getErrorCode } from '@/encryption/helpers/error-code'
import { type EncryptionError, EncryptionErrorTypes } from '@/errors'
import type { Context, LockContext } from '@/identity'
import type { BulkDecryptPayload, BulkDecryptedData, Client } from '@/types'
import { createRequestLogger } from '@/utils/logger'
import { type Result, withResult } from '@byteslice/result'
import {
  type DecryptResult,
  decryptBulkFallible,
} from '@cipherstash/protect-ffi'
import { noClientError } from '../index'
import { EncryptionOperation } from './base-operation'

// Helper functions for better composability
const createDecryptPayloads = (
  encryptedPayloads: BulkDecryptPayload,
  lockContext?: Context,
) => {
  return encryptedPayloads.map(({ id, data }) => ({
    id,
    ciphertext: data,
    ...(lockContext && { lockContext }),
  }))
}

const mapDecryptedDataToResult = (
  encryptedPayloads: BulkDecryptPayload,
  decryptedData: DecryptResult[],
): BulkDecryptedData => {
  return decryptedData.map((decryptResult, i) => {
    if ('error' in decryptResult) {
      return {
        id: encryptedPayloads[i].id,
        error: decryptResult.error,
      }
    }
    return {
      id: encryptedPayloads[i].id,
      data: decryptResult.data,
    }
  })
}

export class BulkDecryptOperation extends EncryptionOperation<BulkDecryptedData> {
  private client: Client
  private encryptedPayloads: BulkDecryptPayload

  constructor(client: Client, encryptedPayloads: BulkDecryptPayload) {
    super()
    this.client = client
    this.encryptedPayloads = encryptedPayloads
  }

  public withLockContext(
    lockContext: LockContext,
  ): BulkDecryptOperationWithLockContext {
    return new BulkDecryptOperationWithLockContext(this, lockContext)
  }

  public async execute(): Promise<Result<BulkDecryptedData, EncryptionError>> {
    const log = createRequestLogger()
    log.set({
      op: 'bulkDecrypt',
      count: this.encryptedPayloads?.length ?? 0,
      lockContext: false,
    })

    const result = await withResult(
      async () => {
        if (!this.client) throw noClientError()
        if (!this.encryptedPayloads || this.encryptedPayloads.length === 0)
          return []

        const payloads = createDecryptPayloads(this.encryptedPayloads)

        const { metadata } = this.getAuditData()

        const decryptedData = await decryptBulkFallible(this.client, {
          ciphertexts: payloads,
          unverifiedContext: metadata,
        })

        return mapDecryptedDataToResult(this.encryptedPayloads, decryptedData)
      },
      (error: unknown) => {
        log.set({ errorCode: getErrorCode(error) ?? 'unknown' })
        return {
          type: EncryptionErrorTypes.DecryptionError,
          message: (error as Error).message,
          code: getErrorCode(error),
        }
      },
    )
    log.emit()
    return result
  }

  public getOperation(): {
    client: Client
    encryptedPayloads: BulkDecryptPayload
  } {
    return {
      client: this.client,
      encryptedPayloads: this.encryptedPayloads,
    }
  }
}

export class BulkDecryptOperationWithLockContext extends EncryptionOperation<BulkDecryptedData> {
  private operation: BulkDecryptOperation
  private lockContext: LockContext

  constructor(operation: BulkDecryptOperation, lockContext: LockContext) {
    super()
    this.operation = operation
    this.lockContext = lockContext
    const auditData = operation.getAuditData()
    if (auditData) {
      this.audit(auditData)
    }
  }

  public async execute(): Promise<Result<BulkDecryptedData, EncryptionError>> {
    const { client, encryptedPayloads } = this.operation.getOperation()

    const log = createRequestLogger()
    log.set({
      op: 'bulkDecrypt',
      count: encryptedPayloads?.length ?? 0,
      lockContext: true,
    })

    const result = await withResult(
      async () => {
        if (!client) throw noClientError()
        if (!encryptedPayloads || encryptedPayloads.length === 0) return []

        const context = await this.lockContext.getLockContext()
        if (context.failure) {
          throw new Error(`[encryption]: ${context.failure.message}`)
        }

        const payloads = createDecryptPayloads(
          encryptedPayloads,
          context.data.context,
        )

        const { metadata } = this.getAuditData()

        const decryptedData = await decryptBulkFallible(client, {
          ciphertexts: payloads,
          serviceToken: context.data.ctsToken,
          unverifiedContext: metadata,
        })

        return mapDecryptedDataToResult(encryptedPayloads, decryptedData)
      },
      (error: unknown) => {
        log.set({ errorCode: getErrorCode(error) ?? 'unknown' })
        return {
          type: EncryptionErrorTypes.DecryptionError,
          message: (error as Error).message,
          code: getErrorCode(error),
        }
      },
    )
    log.emit()
    return result
  }
}
