import { encryptBulk } from '@cipherstash/protect-ffi'
import { withResult, type Result } from '@byteslice/result'
import { noClientError } from '../index'
import { type ProtectError, ProtectErrorTypes } from '../..'
import { logger } from '../../../../utils/logger'
import type { LockContext } from '../../identify'
import type { Client, EncryptOptions, EncryptedPayload } from '../../types'
import type {
  ProtectColumn,
  ProtectValue,
  ProtectTable,
  ProtectTableColumn,
} from '../../schema'
import { ProtectOperation } from './base-operation'

// Types for bulk encryption
export type BulkEncryptPayload =
  | Array<{ id?: string; plaintext: string | null }>
  | Array<string | null>
export type BulkEncryptedData =
  | Array<{ id?: string; c: EncryptedPayload }>
  | Array<EncryptedPayload>

export class BulkEncryptOperation extends ProtectOperation<BulkEncryptedData> {
  private client: Client
  private plaintexts: BulkEncryptPayload
  private column: ProtectColumn | ProtectValue
  private table: ProtectTable<ProtectTableColumn>

  constructor(
    client: Client,
    plaintexts: BulkEncryptPayload,
    opts: EncryptOptions,
  ) {
    super()
    this.client = client
    this.plaintexts = plaintexts
    this.column = opts.column
    this.table = opts.table
  }

  public withLockContext(
    lockContext: LockContext,
  ): BulkEncryptOperationWithLockContext {
    return new BulkEncryptOperationWithLockContext(this, lockContext)
  }

  public async execute(): Promise<Result<BulkEncryptedData, ProtectError>> {
    logger.debug('Bulk encrypting data WITHOUT a lock context', {
      column: this.column.getName(),
      table: this.table.tableName,
    })

    return await withResult(
      async () => {
        if (!this.client) {
          throw noClientError()
        }

        if (!this.plaintexts || this.plaintexts.length === 0) {
          return []
        }

        // If input is array of strings/nulls
        const isSimpleArray =
          typeof this.plaintexts[0] === 'string' || this.plaintexts[0] === null
        if (isSimpleArray) {
          const simplePlaintexts = this.plaintexts as Array<string | null>
          const nonNullPayloads = simplePlaintexts
            .map((plaintext, index) => ({ plaintext, index }))
            .filter(({ plaintext }) => plaintext !== null)
            .map(({ plaintext, index }) => ({
              plaintext: plaintext as string,
              column: this.column.getName(),
              table: this.table.tableName,
              originalIndex: index,
            }))
          if (nonNullPayloads.length === 0) {
            return simplePlaintexts.map(() => null)
          }
          const encryptedData = await encryptBulk(this.client, nonNullPayloads)
          const result: Array<EncryptedPayload> = new Array(
            simplePlaintexts.length,
          )
          let encryptedIndex = 0
          for (let i = 0; i < simplePlaintexts.length; i++) {
            if (simplePlaintexts[i] === null) {
              result[i] = null
            } else {
              result[i] = encryptedData[encryptedIndex]
              encryptedIndex++
            }
          }
          return result
        }

        // If input is array of objects (with or without id)
        const objPlaintexts = this.plaintexts as Array<{
          id?: string
          plaintext: string | null
        }>
        const nonNullPayloads = objPlaintexts
          .map((item, index) => ({ ...item, originalIndex: index }))
          .filter(({ plaintext }) => plaintext !== null)
          .map(({ id, plaintext, originalIndex }) => ({
            id,
            plaintext: plaintext as string,
            column: this.column.getName(),
            table: this.table.tableName,
            originalIndex,
          }))
        if (nonNullPayloads.length === 0) {
          return objPlaintexts.map(({ id }) => ({ id, c: null }))
        }
        const encryptedData = await encryptBulk(this.client, nonNullPayloads)
        const result: Array<{ id?: string; c: EncryptedPayload }> = new Array(
          objPlaintexts.length,
        )
        let encryptedIndex = 0
        for (let i = 0; i < objPlaintexts.length; i++) {
          if (objPlaintexts[i].plaintext === null) {
            result[i] = { id: objPlaintexts[i].id, c: null }
          } else {
            result[i] = {
              id: objPlaintexts[i].id,
              c: encryptedData[encryptedIndex],
            }
            encryptedIndex++
          }
        }
        return result
      },
      (error: unknown) => ({
        type: ProtectErrorTypes.EncryptionError,
        message: (error as Error).message,
      }),
    )
  }

  public getOperation(): {
    client: Client
    plaintexts: BulkEncryptPayload
    column: ProtectColumn | ProtectValue
    table: ProtectTable<ProtectTableColumn>
  } {
    return {
      client: this.client,
      plaintexts: this.plaintexts,
      column: this.column,
      table: this.table,
    }
  }
}

export class BulkEncryptOperationWithLockContext extends ProtectOperation<BulkEncryptedData> {
  private operation: BulkEncryptOperation
  private lockContext: LockContext

  constructor(operation: BulkEncryptOperation, lockContext: LockContext) {
    super()
    this.operation = operation
    this.lockContext = lockContext
  }

  public async execute(): Promise<Result<BulkEncryptedData, ProtectError>> {
    return await withResult(
      async () => {
        const { client, plaintexts, column, table } =
          this.operation.getOperation()
        logger.debug('Bulk encrypting data WITH a lock context', {
          column: column.getName(),
          table: table.tableName,
        })
        if (!client) {
          throw noClientError()
        }
        if (!plaintexts || plaintexts.length === 0) {
          return []
        }
        const context = await this.lockContext.getLockContext()
        if (context.failure) {
          throw new Error(`[protect]: ${context.failure.message}`)
        }
        const isSimpleArray =
          typeof plaintexts[0] === 'string' || plaintexts[0] === null
        if (isSimpleArray) {
          const simplePlaintexts = plaintexts as Array<string | null>
          const nonNullPayloads = simplePlaintexts
            .map((plaintext, index) => ({ plaintext, index }))
            .filter(({ plaintext }) => plaintext !== null)
            .map(({ plaintext, index }) => ({
              plaintext: plaintext as string,
              column: column.getName(),
              table: table.tableName,
              lockContext: context.data.context,
              originalIndex: index,
            }))
          if (nonNullPayloads.length === 0) {
            return simplePlaintexts.map(() => null)
          }
          const encryptedData = await encryptBulk(
            client,
            nonNullPayloads,
            context.data.ctsToken,
          )
          const result: Array<EncryptedPayload> = new Array(
            simplePlaintexts.length,
          )
          let encryptedIndex = 0
          for (let i = 0; i < simplePlaintexts.length; i++) {
            if (simplePlaintexts[i] === null) {
              result[i] = null
            } else {
              result[i] = encryptedData[encryptedIndex]
              encryptedIndex++
            }
          }
          return result
        }
        const objPlaintexts = plaintexts as Array<{
          id?: string
          plaintext: string | null
        }>
        const nonNullPayloads = objPlaintexts
          .map((item, index) => ({ ...item, originalIndex: index }))
          .filter(({ plaintext }) => plaintext !== null)
          .map(({ id, plaintext, originalIndex }) => ({
            id,
            plaintext: plaintext as string,
            column: column.getName(),
            table: table.tableName,
            lockContext: context.data.context,
            originalIndex,
          }))
        if (nonNullPayloads.length === 0) {
          return objPlaintexts.map(({ id }) => ({ id, c: null }))
        }
        const encryptedData = await encryptBulk(
          client,
          nonNullPayloads,
          context.data.ctsToken,
        )
        const result: Array<{ id?: string; c: EncryptedPayload }> = new Array(
          objPlaintexts.length,
        )
        let encryptedIndex = 0
        for (let i = 0; i < objPlaintexts.length; i++) {
          if (objPlaintexts[i].plaintext === null) {
            result[i] = { id: objPlaintexts[i].id, c: null }
          } else {
            result[i] = {
              id: objPlaintexts[i].id,
              c: encryptedData[encryptedIndex],
            }
            encryptedIndex++
          }
        }
        return result
      },
      (error: unknown) => ({
        type: ProtectErrorTypes.EncryptionError,
        message: (error as Error).message,
      }),
    )
  }
}
