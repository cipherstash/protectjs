import { type Result, withResult } from '@byteslice/result'
import { type JsPlaintext, encryptBulk } from '@cipherstash/protect-ffi'
import type {
  EncryptConfig,
  ProtectColumn,
  ProtectTable,
  ProtectTableColumn,
  ProtectValue,
} from '@cipherstash/schema'
import { type ProtectError, ProtectErrorTypes } from '../..'
import { logger } from '../../../../utils/logger'
import type { Context, LockContext } from '../../identify'
import type {
  BulkEncryptPayload,
  BulkEncryptedData,
  Client,
  EncryptOptions,
  Encrypted,
} from '../../types'
import { noClientError } from '../index'
import { ProtectOperation } from './base-operation'

// Helper functions for better composability
const createEncryptPayloads = <C extends EncryptConfig = EncryptConfig>(
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
      ...(lockContext && { lockContext: [lockContext] }),
    }))
}

const createNullResult = <C extends EncryptConfig = EncryptConfig>(
  plaintexts: BulkEncryptPayload,
): BulkEncryptedData<C> => {
  return plaintexts.map(({ id }) => ({ id, data: null }))
}

const mapEncryptedDataToResult = <C extends EncryptConfig = EncryptConfig>(
  plaintexts: BulkEncryptPayload,
  encryptedData: Encrypted<C>[],
): BulkEncryptedData<C> => {
  const result: BulkEncryptedData<C> = new Array(plaintexts.length)
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

export class BulkEncryptOperation<
  C extends EncryptConfig = EncryptConfig,
> extends ProtectOperation<BulkEncryptedData<C>> {
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
  ): BulkEncryptOperationWithLockContext<C> {
    return new BulkEncryptOperationWithLockContext<C>(this, lockContext)
  }

  public async execute(): Promise<Result<BulkEncryptedData<C>, ProtectError>> {
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

        const nonNullPayloads = createEncryptPayloads<C>(
          this.plaintexts,
          this.column,
          this.table,
        )

        if (nonNullPayloads.length === 0) {
          return createNullResult<C>(this.plaintexts)
        }

        const { metadata } = this.getAuditData()

        const encryptedData = await encryptBulk(this.client, {
          // biome-ignore lint/suspicious/noExplicitAny: Context type mismatch between local and FFI types
          plaintexts: nonNullPayloads as any,
          unverifiedContext: metadata,
        })

        return mapEncryptedDataToResult<C>(this.plaintexts, encryptedData)
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

export class BulkEncryptOperationWithLockContext<
  C extends EncryptConfig = EncryptConfig,
> extends ProtectOperation<BulkEncryptedData<C>> {
  private operation: BulkEncryptOperation<C>
  private lockContext: LockContext

  constructor(operation: BulkEncryptOperation<C>, lockContext: LockContext) {
    super()
    this.operation = operation
    this.lockContext = lockContext
  }

  public async execute(): Promise<Result<BulkEncryptedData<C>, ProtectError>> {
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

        const nonNullPayloads = createEncryptPayloads<C>(
          plaintexts,
          column,
          table,
          context.data.context,
        )

        if (nonNullPayloads.length === 0) {
          return createNullResult<C>(plaintexts)
        }

        const { metadata } = this.getAuditData()

        const encryptedData = await encryptBulk(client, {
          // biome-ignore lint/suspicious/noExplicitAny: Context type mismatch between local and FFI types
          plaintexts: nonNullPayloads as any,
          serviceToken: context.data.ctsToken,
          unverifiedContext: metadata,
        })

        return mapEncryptedDataToResult<C>(plaintexts, encryptedData)
      },
      (error: unknown) => ({
        type: ProtectErrorTypes.EncryptionError,
        message: (error as Error).message,
      }),
    )
  }
}
