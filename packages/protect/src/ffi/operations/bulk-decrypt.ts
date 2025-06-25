import { decryptBulk } from '@cipherstash/protect-ffi'
import { withResult, type Result } from '@byteslice/result'
import { noClientError } from '../index'
import { type ProtectError, ProtectErrorTypes } from '../..'
import { logger } from '../../../../utils/logger'
import type { LockContext } from '../../identify'
import type { Client, EncryptedPayload } from '../../types'
import { ProtectOperation } from './base-operation'

export type BulkDecryptPayload =
  | Array<{ id?: string; c: EncryptedPayload }>
  | Array<EncryptedPayload | null>
export type BulkDecryptedData =
  | Array<{ id?: string; plaintext: string | null }>
  | Array<string | null>

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

        const isSimpleArray =
          typeof this.encryptedPayloads[0] !== 'object' ||
          this.encryptedPayloads[0] === null ||
          !('c' in (this.encryptedPayloads[0] || {}))
        if (isSimpleArray) {
          const simplePayloads = this
            .encryptedPayloads as Array<EncryptedPayload | null>
          const nonNullPayloads = simplePayloads
            .map((c, index) => ({ c, index }))
            .filter(({ c }) => c !== null)
            .map(({ c, index }) => ({
              ciphertext: (typeof c === 'object' && c !== null
                ? c.c
                : c) as string,
              originalIndex: index,
            }))
          if (nonNullPayloads.length === 0)
            return simplePayloads.map(() => null)
          const decryptedData = await decryptBulk(this.client, nonNullPayloads)
          const result: Array<string | null> = new Array(simplePayloads.length)
          let decryptedIndex = 0
          for (let i = 0; i < simplePayloads.length; i++) {
            if (simplePayloads[i] === null) {
              result[i] = null
            } else {
              result[i] = decryptedData[decryptedIndex]
              decryptedIndex++
            }
          }
          return result
        }
        // Array of objects (with or without id)
        const objPayloads = this.encryptedPayloads as Array<{
          id?: string
          c: EncryptedPayload
        }>
        const nonNullPayloads = objPayloads
          .map((item, index) => ({ ...item, originalIndex: index }))
          .filter(({ c }) => c !== null)
          .map(({ id, c, originalIndex }) => ({
            id,
            ciphertext: (typeof c === 'object' && c !== null
              ? c.c
              : c) as string,
            originalIndex,
          }))
        if (nonNullPayloads.length === 0)
          return objPayloads.map(({ id }) => ({ id, plaintext: null }))
        const decryptedData = await decryptBulk(this.client, nonNullPayloads)
        const result: Array<{ id?: string; plaintext: string | null }> =
          new Array(objPayloads.length)
        let decryptedIndex = 0
        for (let i = 0; i < objPayloads.length; i++) {
          if (objPayloads[i].c === null) {
            result[i] = { id: objPayloads[i].id, plaintext: null }
          } else {
            result[i] = {
              id: objPayloads[i].id,
              plaintext: decryptedData[decryptedIndex],
            }
            decryptedIndex++
          }
        }
        return result
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
        if (context.failure)
          throw new Error(`[protect]: ${context.failure.message}`)
        const isSimpleArray =
          typeof encryptedPayloads[0] !== 'object' ||
          encryptedPayloads[0] === null ||
          !('c' in (encryptedPayloads[0] || {}))
        if (isSimpleArray) {
          const simplePayloads =
            encryptedPayloads as Array<EncryptedPayload | null>
          const nonNullPayloads = simplePayloads
            .map((c, index) => ({ c, index }))
            .filter(({ c }) => c !== null)
            .map(({ c, index }) => ({
              ciphertext: (typeof c === 'object' && c !== null
                ? c.c
                : c) as string,
              originalIndex: index,
              lockContext: context.data.context,
            }))
          if (nonNullPayloads.length === 0)
            return simplePayloads.map(() => null)
          const decryptedData = await decryptBulk(
            client,
            nonNullPayloads,
            context.data.ctsToken,
          )
          const result: Array<string | null> = new Array(simplePayloads.length)
          let decryptedIndex = 0
          for (let i = 0; i < simplePayloads.length; i++) {
            if (simplePayloads[i] === null) {
              result[i] = null
            } else {
              result[i] = decryptedData[decryptedIndex]
              decryptedIndex++
            }
          }
          return result
        }
        // Array of objects (with or without id)
        const objPayloads = encryptedPayloads as Array<{
          id?: string
          c: EncryptedPayload
        }>
        const nonNullPayloads = objPayloads
          .map((item, index) => ({ ...item, originalIndex: index }))
          .filter(({ c }) => c !== null)
          .map(({ id, c, originalIndex }) => ({
            id,
            ciphertext: (typeof c === 'object' && c !== null
              ? c.c
              : c) as string,
            originalIndex,
            lockContext: context.data.context,
          }))
        if (nonNullPayloads.length === 0)
          return objPayloads.map(({ id }) => ({ id, plaintext: null }))
        const decryptedData = await decryptBulk(
          client,
          nonNullPayloads,
          context.data.ctsToken,
        )
        const result: Array<{ id?: string; plaintext: string | null }> =
          new Array(objPayloads.length)
        let decryptedIndex = 0
        for (let i = 0; i < objPayloads.length; i++) {
          if (objPayloads[i].c === null) {
            result[i] = { id: objPayloads[i].id, plaintext: null }
          } else {
            result[i] = {
              id: objPayloads[i].id,
              plaintext: decryptedData[decryptedIndex],
            }
            decryptedIndex++
          }
        }
        return result
      },
      (error: unknown) => ({
        type: ProtectErrorTypes.DecryptionError,
        message: (error as Error).message,
      }),
    )
  }
}
