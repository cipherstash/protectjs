import { type Result, withResult } from '@byteslice/result'
import {
  type Encrypted as CipherStashEncrypted,
  type DecryptResult,
  decryptBulkFallible,
} from '@cipherstash/protect-ffi'
import { type ProtectError, ProtectErrorTypes } from '../..'
import { logger } from '../../../../utils/logger'
import type { Context, LockContext } from '../../identify'
import type { BulkDecryptPayload, BulkDecryptedData, Client } from '../../types'
import { noClientError } from '../index'
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
      ciphertext: data as CipherStashEncrypted,
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

/**
 * Thenable wrapper for {@link ProtectClient.bulkDecrypt}. Handles large batches
 * while preserving per-item error reporting so you can retry selectively.
 */
export class BulkDecryptOperation extends ProtectOperation<BulkDecryptedData> {
  private client: Client
  private encryptedPayloads: BulkDecryptPayload

  constructor(client: Client, encryptedPayloads: BulkDecryptPayload) {
    super()
    this.client = client
    this.encryptedPayloads = encryptedPayloads
  }

  /**
   * Bind a lock context so decryption honours identity-aware access controls.
   *
   * @param lockContext - CTS lock context resolved via {@link LockContext.identify}.
   */
  public withLockContext(
    lockContext: LockContext,
  ): BulkDecryptOperationWithLockContext {
    return new BulkDecryptOperationWithLockContext(this, lockContext)
  }

  /**
   * Execute the bulk decryption without a lock context. Null payloads remain
   * null in the response to keep array ordering stable.
   */
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

        const { metadata } = this.getAuditData()

        const decryptedData = await decryptBulkFallible(this.client, {
          ciphertexts: nonNullPayloads,
          unverifiedContext: metadata,
        })

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

/**
 * Lock-context aware variant of {@link BulkDecryptOperation}. Every decrypted
 * item is authorised with the supplied CTS token.
 */
export class BulkDecryptOperationWithLockContext extends ProtectOperation<BulkDecryptedData> {
  private operation: BulkDecryptOperation
  private lockContext: LockContext

  constructor(operation: BulkDecryptOperation, lockContext: LockContext) {
    super()
    this.operation = operation
    this.lockContext = lockContext
  }

  /**
   * Execute the lock-context scoped bulk decryption. CTS token resolution
   * errors bubble through the Protect error contract.
   */
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

        const { metadata } = this.getAuditData()

        const decryptedData = await decryptBulkFallible(client, {
          ciphertexts: nonNullPayloads,
          serviceToken: context.data.ctsToken,
          unverifiedContext: metadata,
        })

        return mapDecryptedDataToResult(encryptedPayloads, decryptedData)
      },
      (error: unknown) => ({
        type: ProtectErrorTypes.DecryptionError,
        message: (error as Error).message,
      }),
    )
  }
}
