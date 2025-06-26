import {
  decryptBulkFallible,
  type DecryptResult,
} from '@cipherstash/protect-ffi'
import { withResult, type Result } from '@byteslice/result'
import { noClientError } from '../index'
import { type ProtectError, ProtectErrorTypes } from '../..'
import { logger } from '../../../../utils/logger'
import type { LockContext, Context } from '../../identify'
import type { Client, BulkDecryptPayload, BulkDecryptedData } from '../../types'
import { ProtectOperation } from './base-operation'

// Helper functions for better composability
const createDecryptPayloads = (
  encryptedPayloads: BulkDecryptPayload,
  lockContext?: Context,
) => {
  return encryptedPayloads
    .map((item, index) => ({ ...item, originalIndex: index }))
    .filter(({ data }) => data !== null)
    .map(({ id, data, originalIndex }) => ({
      id,
      ciphertext: (typeof data === 'object' && data !== null
        ? data.c
        : data) as string,
      originalIndex,
      ...(lockContext && { lockContext }),
    }))
}

const createNullResult = (
  encryptedPayloads: BulkDecryptPayload,
): BulkDecryptedData => {
  return encryptedPayloads.map(({ id }) => ({
    id,
    data: null,
  }))
}

const mapDecryptedDataToResult = (
  encryptedPayloads: BulkDecryptPayload,
  decryptedData: DecryptResult[],
): BulkDecryptedData => {
  const result: BulkDecryptedData = new Array(encryptedPayloads.length)
  let decryptedIndex = 0

  for (let i = 0; i < encryptedPayloads.length; i++) {
    if (encryptedPayloads[i].data === null) {
      result[i] = { id: encryptedPayloads[i].id, data: null }
    } else {
      const decryptResult = decryptedData[decryptedIndex]
      if ('error' in decryptResult) {
        result[i] = {
          id: encryptedPayloads[i].id,
          error: decryptResult.error,
        }
      } else {
        result[i] = {
          id: encryptedPayloads[i].id,
          data: decryptResult.data,
        }
      }
      decryptedIndex++
    }
  }

  return result
}

export class BulkDecryptOperation extends ProtectOperation<BulkDecryptedData> {
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

  public async execute(): Promise<Result<BulkDecryptedData, ProtectError>> {
    logger.debug('Bulk decrypting data WITHOUT a lock context')
    return await withResult(
      async () => {
        if (!this.client) throw noClientError()
        if (!this.encryptedPayloads || this.encryptedPayloads.length === 0)
          return []

        const nonNullPayloads = createDecryptPayloads(this.encryptedPayloads)

        if (nonNullPayloads.length === 0) {
          return createNullResult(this.encryptedPayloads)
        }

        const decryptedData = await decryptBulkFallible(
          this.client,
          nonNullPayloads,
        )
        return mapDecryptedDataToResult(this.encryptedPayloads, decryptedData)
      },
      (error: unknown) => ({
        type: ProtectErrorTypes.DecryptionError,
        message: (error as Error).message,
      }),
    )
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

export class BulkDecryptOperationWithLockContext extends ProtectOperation<BulkDecryptedData> {
  private operation: BulkDecryptOperation
  private lockContext: LockContext

  constructor(operation: BulkDecryptOperation, lockContext: LockContext) {
    super()
    this.operation = operation
    this.lockContext = lockContext
  }

  public async execute(): Promise<Result<BulkDecryptedData, ProtectError>> {
    return await withResult(
      async () => {
        const { client, encryptedPayloads } = this.operation.getOperation()
        logger.debug('Bulk decrypting data WITH a lock context')

        if (!client) throw noClientError()
        if (!encryptedPayloads || encryptedPayloads.length === 0) return []

        const context = await this.lockContext.getLockContext()
        if (context.failure) {
          throw new Error(`[protect]: ${context.failure.message}`)
        }

        const nonNullPayloads = createDecryptPayloads(
          encryptedPayloads,
          context.data.context,
        )

        if (nonNullPayloads.length === 0) {
          return createNullResult(encryptedPayloads)
        }

        const decryptedData = await decryptBulkFallible(
          client,
          nonNullPayloads,
          context.data.ctsToken,
        )

        return mapDecryptedDataToResult(encryptedPayloads, decryptedData)
      },
      (error: unknown) => ({
        type: ProtectErrorTypes.DecryptionError,
        message: (error as Error).message,
      }),
    )
  }
}
