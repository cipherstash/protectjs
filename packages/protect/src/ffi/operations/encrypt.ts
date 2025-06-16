import { encrypt as ffiEncrypt } from '@cipherstash/protect-ffi'
import { withResult, type Result } from '@byteslice/result'
import { noClientError } from '../index'
import { type ProtectError, ProtectErrorTypes } from '../..'
import { logger } from '../../../../utils/logger'
import type { LockContext } from '../../identify'
import type {
  Client,
  EncryptedPayload,
  EncryptPayload,
  EncryptOptions,
} from '../../types'
import type {
  ProtectColumn,
  ProtectValue,
  ProtectTable,
  ProtectTableColumn,
} from '../../schema'
import { ProtectOperation } from './base-operation'

export class EncryptOperation extends ProtectOperation<EncryptedPayload> {
  private client: Client
  private plaintext: EncryptPayload
  private column: ProtectColumn | ProtectValue
  private table: ProtectTable<ProtectTableColumn>

  constructor(client: Client, plaintext: EncryptPayload, opts: EncryptOptions) {
    super()
    this.client = client
    this.plaintext = plaintext
    this.column = opts.column
    this.table = opts.table
  }

  public withLockContext(
    lockContext: LockContext,
  ): EncryptOperationWithLockContext {
    return new EncryptOperationWithLockContext(this, lockContext)
  }

  public async execute(): Promise<Result<EncryptedPayload, ProtectError>> {
    logger.debug('Encrypting data WITHOUT a lock context', {
      column: this.column.getName(),
      table: this.table.tableName,
    })

    return await withResult(
      async () => {
        if (!this.client) {
          throw noClientError()
        }

        if (this.plaintext === null) {
          return null
        }

        return await ffiEncrypt(this.client, {
          plaintext: this.plaintext,
          column: this.column.getName(),
          table: this.table.tableName,
        })
      },
      (error) => ({
        type: ProtectErrorTypes.EncryptionError,
        message: error.message,
      }),
    )
  }

  public getOperation(): {
    client: Client
    plaintext: EncryptPayload
    column: ProtectColumn | ProtectValue
    table: ProtectTable<ProtectTableColumn>
  } {
    return {
      client: this.client,
      plaintext: this.plaintext,
      column: this.column,
      table: this.table,
    }
  }
}

export class EncryptOperationWithLockContext extends ProtectOperation<EncryptedPayload> {
  private operation: EncryptOperation
  private lockContext: LockContext

  constructor(operation: EncryptOperation, lockContext: LockContext) {
    super()
    this.operation = operation
    this.lockContext = lockContext
  }

  public async execute(): Promise<Result<EncryptedPayload, ProtectError>> {
    return await withResult(
      async () => {
        const { client, plaintext, column, table } =
          this.operation.getOperation()

        logger.debug('Encrypting data WITH a lock context', {
          column: column,
          table: table,
        })

        if (!client) {
          throw noClientError()
        }

        if (plaintext === null) {
          return null
        }

        const context = await this.lockContext.getLockContext()

        if (context.failure) {
          throw new Error(`[protect]: ${context.failure.message}`)
        }

        return await ffiEncrypt(
          client,
          {
            plaintext,
            column: column.getName(),
            table: table.tableName,
            lockContext: context.data.context,
          },
          context.data.ctsToken,
        )
      },
      (error) => ({
        type: ProtectErrorTypes.EncryptionError,
        message: error.message,
      }),
    )
  }
}
