import { type Result, withResult } from '@byteslice/result'
import {
  type JsPlaintext,
  encryptQuery as ffiEncryptQuery,
} from '@cipherstash/protect-ffi'
import type {
  ProtectColumn,
  ProtectTable,
  ProtectTableColumn,
  ProtectValue,
} from '@cipherstash/schema'
import { type ProtectError, ProtectErrorTypes } from '../..'
import { logger } from '../../../../utils/logger'
import type { LockContext } from '../../identify'
import type {
  Client,
  EncryptQueryOptions,
  Encrypted,
  IndexTypeName,
  QueryOpName,
} from '../../types'
import { noClientError } from '../index'
import { ProtectOperation } from './base-operation'

/**
 * Operation for encrypting a single query term with explicit index type control.
 *
 * Unlike `EncryptOperation`, this produces SEM-only (Searchable Encrypted Metadata)
 * payloads optimized for database queries - no ciphertext field is included.
 *
 * @example
 * // ORE query for range comparisons
 * const term = await protectClient.encryptQuery(100, {
 *   column: usersSchema.score,
 *   table: usersSchema,
 *   indexType: 'ore',
 * })
 *
 * @example
 * // SteVec query for JSON containment
 * const term = await protectClient.encryptQuery({ role: 'admin' }, {
 *   column: usersSchema.metadata,
 *   table: usersSchema,
 *   indexType: 'ste_vec',
 *   queryOp: 'ste_vec_term',
 * })
 */
export class EncryptQueryOperation extends ProtectOperation<Encrypted> {
  private client: Client
  private plaintext: JsPlaintext | null
  private column: ProtectColumn | ProtectValue
  private table: ProtectTable<ProtectTableColumn>
  private indexType: IndexTypeName
  private queryOp?: QueryOpName

  constructor(
    client: Client,
    plaintext: JsPlaintext | null,
    opts: EncryptQueryOptions,
  ) {
    super()
    this.client = client
    this.plaintext = plaintext
    this.column = opts.column
    this.table = opts.table
    this.indexType = opts.indexType
    this.queryOp = opts.queryOp
  }

  public withLockContext(
    lockContext: LockContext,
  ): EncryptQueryOperationWithLockContext {
    return new EncryptQueryOperationWithLockContext(this, lockContext)
  }

  public async execute(): Promise<Result<Encrypted, ProtectError>> {
    logger.debug('Encrypting query WITHOUT a lock context', {
      column: this.column.getName(),
      table: this.table.tableName,
      indexType: this.indexType,
      queryOp: this.queryOp,
    })

    return await withResult(
      async () => {
        if (!this.client) {
          throw noClientError()
        }

        if (this.plaintext === null) {
          return null
        }

        const { metadata } = this.getAuditData()

        return await ffiEncryptQuery(this.client, {
          plaintext: this.plaintext,
          column: this.column.getName(),
          table: this.table.tableName,
          indexType: this.indexType,
          queryOp: this.queryOp,
          unverifiedContext: metadata,
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
    plaintext: JsPlaintext | null
    column: ProtectColumn | ProtectValue
    table: ProtectTable<ProtectTableColumn>
    indexType: IndexTypeName
    queryOp?: QueryOpName
  } {
    return {
      client: this.client,
      plaintext: this.plaintext,
      column: this.column,
      table: this.table,
      indexType: this.indexType,
      queryOp: this.queryOp,
    }
  }
}

export class EncryptQueryOperationWithLockContext extends ProtectOperation<Encrypted> {
  private operation: EncryptQueryOperation
  private lockContext: LockContext

  constructor(operation: EncryptQueryOperation, lockContext: LockContext) {
    super()
    this.operation = operation
    this.lockContext = lockContext
  }

  public async execute(): Promise<Result<Encrypted, ProtectError>> {
    return await withResult(
      async () => {
        const { client, plaintext, column, table, indexType, queryOp } =
          this.operation.getOperation()

        logger.debug('Encrypting query WITH a lock context', {
          column: column.getName(),
          table: table.tableName,
          indexType,
          queryOp,
        })

        if (!client) {
          throw noClientError()
        }

        if (plaintext === null) {
          return null
        }

        const { metadata } = this.getAuditData()
        const context = await this.lockContext.getLockContext()

        if (context.failure) {
          throw new Error(`[protect]: ${context.failure.message}`)
        }

        return await ffiEncryptQuery(client, {
          plaintext,
          column: column.getName(),
          table: table.tableName,
          indexType,
          queryOp,
          lockContext: context.data.context,
          serviceToken: context.data.ctsToken,
          unverifiedContext: metadata,
        })
      },
      (error) => ({
        type: ProtectErrorTypes.EncryptionError,
        message: error.message,
      }),
    )
  }
}
