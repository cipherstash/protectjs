import { type Result, withResult } from '@byteslice/result'
import {
  type AnyEncrypted as CipherStashEncrypted,
  type DecryptResult,
  decryptBulkFallible,
} from '@cipherstash/protect-ffi'
import type { EncryptConfig } from '@cipherstash/schema'
import { type ProtectError, ProtectErrorTypes } from '../..'
import { logger } from '../../../../utils/logger'
import type { Context, LockContext } from '../../identify'
import type { BulkDecryptPayload, BulkDecryptedData, Client } from '../../types'
import { noClientError } from '../index'
import { ProtectOperation } from './base-operation'

// Helper functions for better composability
const createDecryptPayloads = <C extends EncryptConfig = EncryptConfig>(
  encryptedPayloads: BulkDecryptPayload<C>,
  lockContext?: Context,
) => {
  return encryptedPayloads
    .map((item, index) => ({ ...item, originalIndex: index }))
    .filter(({ data }) => data !== null)
    .map(({ id, data, originalIndex }) => ({
      id,
      ciphertext: data as CipherStashEncrypted<C>,
      originalIndex,
      ...(lockContext && { lockContext: [lockContext] }),
    }))
}

const createNullResult = <C extends EncryptConfig = EncryptConfig>(
  encryptedPayloads: BulkDecryptPayload<C>,
): BulkDecryptedData => {
  return encryptedPayloads.map(({ id }) => ({
    id,
    data: null,
  }))
}

const mapDecryptedDataToResult = <C extends EncryptConfig = EncryptConfig>(
  encryptedPayloads: BulkDecryptPayload<C>,
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

export class BulkDecryptOperation<
  C extends EncryptConfig = EncryptConfig,
> extends ProtectOperation<BulkDecryptedData> {
  private client: Client
  private encryptedPayloads: BulkDecryptPayload<C>

  constructor(client: Client, encryptedPayloads: BulkDecryptPayload<C>) {
    super()
    this.client = client
    this.encryptedPayloads = encryptedPayloads
  }

  public withLockContext(
    lockContext: LockContext,
  ): BulkDecryptOperationWithLockContext<C> {
    return new BulkDecryptOperationWithLockContext<C>(this, lockContext)
  }

  public async execute(): Promise<Result<BulkDecryptedData, ProtectError>> {
    logger.debug('Bulk decrypting data WITHOUT a lock context')
    return await withResult(
      async () => {
        if (!this.client) throw noClientError()
        if (!this.encryptedPayloads || this.encryptedPayloads.length === 0)
          return []

        const nonNullPayloads = createDecryptPayloads<C>(this.encryptedPayloads)

        if (nonNullPayloads.length === 0) {
          return createNullResult<C>(this.encryptedPayloads)
        }

        const { metadata } = this.getAuditData()

        const decryptedData = await decryptBulkFallible(this.client, {
          // biome-ignore lint/suspicious/noExplicitAny: Context type mismatch between local and FFI types
          ciphertexts: nonNullPayloads as any,
          unverifiedContext: metadata,
        })

        return mapDecryptedDataToResult<C>(
          this.encryptedPayloads,
          decryptedData,
        )
      },
      (error: unknown) => ({
        type: ProtectErrorTypes.DecryptionError,
        message: (error as Error).message,
      }),
    )
  }

  public getOperation(): {
    client: Client
    encryptedPayloads: BulkDecryptPayload<C>
  } {
    return {
      client: this.client,
      encryptedPayloads: this.encryptedPayloads,
    }
  }
}

export class BulkDecryptOperationWithLockContext<
  C extends EncryptConfig = EncryptConfig,
> extends ProtectOperation<BulkDecryptedData> {
  private operation: BulkDecryptOperation<C>
  private lockContext: LockContext

  constructor(operation: BulkDecryptOperation<C>, lockContext: LockContext) {
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

        const nonNullPayloads = createDecryptPayloads<C>(
          encryptedPayloads,
          context.data.context,
        )

        if (nonNullPayloads.length === 0) {
          return createNullResult<C>(encryptedPayloads)
        }

        const { metadata } = this.getAuditData()

        const decryptedData = await decryptBulkFallible(client, {
          // biome-ignore lint/suspicious/noExplicitAny: Context type mismatch between local and FFI types
          ciphertexts: nonNullPayloads as any,
          serviceToken: context.data.ctsToken,
          unverifiedContext: metadata,
        })

        return mapDecryptedDataToResult<C>(encryptedPayloads, decryptedData)
      },
      (error: unknown) => ({
        type: ProtectErrorTypes.DecryptionError,
        message: (error as Error).message,
      }),
    )
  }
}
