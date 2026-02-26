import { getErrorCode } from '@/encryption/helpers/error-code'
import { type EncryptionError, EncryptionErrorTypes } from '@/errors'
import type { Context, LockContext } from '@/identity'
import type {
  EncryptedColumn,
  EncryptedTable,
  EncryptedTableColumn,
  EncryptedField,
} from '@/schema'
import type {
  BulkEncryptPayload,
  BulkEncryptedData,
  Client,
  InternalEncryptOptions,
} from '@/types'
import { createRequestLogger } from '@/utils/logger'
import { type Result, withResult } from '@byteslice/result'
import { encryptBulk } from '@cipherstash/protect-ffi'
import { noClientError } from '../index'
import { EncryptionOperation } from './base-operation'

// Helper functions for better composability
const createEncryptPayloads = (
  plaintexts: BulkEncryptPayload,
  column: EncryptedColumn | EncryptedField,
  table: EncryptedTable<EncryptedTableColumn>,
  lockContext?: Context,
) => {
  return plaintexts.map(({ id, plaintext }) => ({
    id,
    plaintext,
    column: column.getName(),
    table: table.tableName,
    ...(lockContext && { lockContext }),
  }))
}

export class BulkEncryptOperation extends EncryptionOperation<BulkEncryptedData> {
  private client: Client
  private plaintexts: BulkEncryptPayload
  private column: EncryptedColumn | EncryptedField
  private table: EncryptedTable<EncryptedTableColumn>

  constructor(
    client: Client,
    plaintexts: BulkEncryptPayload,
    opts: InternalEncryptOptions,
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
    const log = createRequestLogger()
    log.set({
      op: 'bulkEncrypt',
      table: this.table.tableName,
      column: this.column.getName(),
      count: this.plaintexts?.length ?? 0,
      lockContext: false,
    })

    const result = await withResult(
      async () => {
        if (!this.client) {
          throw noClientError()
        }
        if (!this.plaintexts || this.plaintexts.length === 0) {
          return []
        }

        const payloads = createEncryptPayloads(
          this.plaintexts,
          this.column,
          this.table,
        )

        const { metadata } = this.getAuditData()

        const encryptedData = await encryptBulk(this.client, {
          plaintexts: payloads,
          unverifiedContext: metadata,
        })

        return encryptedData.map((data, i) => ({
          id: this.plaintexts[i].id,
          data,
        }))
      },
      (error: unknown) => {
        log.set({ errorCode: getErrorCode(error) ?? 'unknown' })
        return {
          type: EncryptionErrorTypes.EncryptionError,
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
    plaintexts: BulkEncryptPayload
    column: EncryptedColumn | EncryptedField
    table: EncryptedTable<EncryptedTableColumn>
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
    const { client, plaintexts, column, table } = this.operation.getOperation()

    const log = createRequestLogger()
    log.set({
      op: 'bulkEncrypt',
      table: table.tableName,
      column: column.getName(),
      count: plaintexts?.length ?? 0,
      lockContext: true,
    })

    const result = await withResult(
      async () => {
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

        const payloads = createEncryptPayloads(
          plaintexts,
          column,
          table,
          context.data.context,
        )

        const { metadata } = this.getAuditData()

        const encryptedData = await encryptBulk(client, {
          plaintexts: payloads,
          serviceToken: context.data.ctsToken,
          unverifiedContext: metadata,
        })

        return encryptedData.map((data, i) => ({
          id: plaintexts[i].id,
          data,
        }))
      },
      (error: unknown) => {
        log.set({ errorCode: getErrorCode(error) ?? 'unknown' })
        return {
          type: EncryptionErrorTypes.EncryptionError,
          message: (error as Error).message,
          code: getErrorCode(error),
        }
      },
    )
    log.emit()
    return result
  }
}
