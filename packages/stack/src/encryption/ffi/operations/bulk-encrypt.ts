import { getErrorCode } from '@/encryption/ffi/helpers/error-code'
import { type EncryptionError, EncryptionErrorTypes } from '@/errors'
import type { Context, LockContext } from '@/identity'
import type {
  ProtectColumn,
  ProtectTable,
  ProtectTableColumn,
  ProtectValue,
} from '@/schema'
import type {
  BulkEncryptPayload,
  BulkEncryptedData,
  Client,
  EncryptOptions,
  Encrypted,
} from '@/types'
import { logger } from '@/utils/logger'
import { type Result, withResult } from '@byteslice/result'
import { type JsPlaintext, encryptBulk } from '@cipherstash/protect-ffi'
import { noClientError } from '../index'
import { EncryptionOperation } from './base-operation'

// Helper functions for better composability
const createEncryptPayloads = (
  plaintexts: BulkEncryptPayload,
  column: ProtectColumn | ProtectValue,
  table: ProtectTable<ProtectTableColumn>,
  lockContext?: Context,
) => {
  return plaintexts
    .map((item, index) => ({ ...item, originalIndex: index }))
    .filter(({ plaintext }) => plaintext !== null)
    .map(({ id, plaintext, originalIndex }) => ({
      id,
      plaintext: plaintext as JsPlaintext,
      column: column.getName(),
      table: table.tableName,
      originalIndex,
      ...(lockContext && { lockContext }),
    }))
}

const createNullResult = (
  plaintexts: BulkEncryptPayload,
): BulkEncryptedData => {
  return plaintexts.map(({ id }) => ({ id, data: null }))
}

const mapEncryptedDataToResult = (
  plaintexts: BulkEncryptPayload,
  encryptedData: Encrypted[],
): BulkEncryptedData => {
  const result: BulkEncryptedData = new Array(plaintexts.length)
  let encryptedIndex = 0

  for (let i = 0; i < plaintexts.length; i++) {
    if (plaintexts[i].plaintext === null) {
      result[i] = { id: plaintexts[i].id, data: null }
    } else {
      result[i] = {
        id: plaintexts[i].id,
        data: encryptedData[encryptedIndex],
      }
      encryptedIndex++
    }
  }

  return result
}

export class BulkEncryptOperation extends EncryptionOperation<BulkEncryptedData> {
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

  public async execute(): Promise<Result<BulkEncryptedData, EncryptionError>> {
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

        const nonNullPayloads = createEncryptPayloads(
          this.plaintexts,
          this.column,
          this.table,
        )

        if (nonNullPayloads.length === 0) {
          return createNullResult(this.plaintexts)
        }

        const { metadata } = this.getAuditData()

        const encryptedData = await encryptBulk(this.client, {
          plaintexts: nonNullPayloads,
          unverifiedContext: metadata,
        })

        return mapEncryptedDataToResult(this.plaintexts, encryptedData)
      },
      (error: unknown) => ({
        type: EncryptionErrorTypes.EncryptionError,
        message: (error as Error).message,
        code: getErrorCode(error),
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

export class BulkEncryptOperationWithLockContext extends EncryptionOperation<BulkEncryptedData> {
  private operation: BulkEncryptOperation
  private lockContext: LockContext

  constructor(operation: BulkEncryptOperation, lockContext: LockContext) {
    super()
    this.operation = operation
    this.lockContext = lockContext
    const auditData = operation.getAuditData()
    if (auditData) {
      this.audit(auditData)
    }
  }

  public async execute(): Promise<Result<BulkEncryptedData, EncryptionError>> {
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
          throw new Error(`[encryption]: ${context.failure.message}`)
        }

        const nonNullPayloads = createEncryptPayloads(
          plaintexts,
          column,
          table,
          context.data.context,
        )

        if (nonNullPayloads.length === 0) {
          return createNullResult(plaintexts)
        }

        const { metadata } = this.getAuditData()

        const encryptedData = await encryptBulk(client, {
          plaintexts: nonNullPayloads,
          serviceToken: context.data.ctsToken,
          unverifiedContext: metadata,
        })

        return mapEncryptedDataToResult(plaintexts, encryptedData)
      },
      (error: unknown) => ({
        type: EncryptionErrorTypes.EncryptionError,
        message: (error as Error).message,
        code: getErrorCode(error),
      }),
    )
  }
}
