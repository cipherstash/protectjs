import { type Result, withResult } from '@byteslice/result'
import {
  type JsPlaintext,
  encrypt as ffiEncrypt,
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
import type { Client, EncryptOptions, Encrypted } from '../../types'
import { noClientError } from '../index'
import { ProtectOperation } from './base-operation'

/**
 * Thenable operation returned by {@link ProtectClient.encrypt}. Supports
 * optional lock contexts and audit metadata, aligning with CipherStash’s
 * zero-trust access controls.
 */
export class EncryptOperation extends ProtectOperation<Encrypted> {
  private client: Client
  private plaintext: JsPlaintext | null
  private column: ProtectColumn | ProtectValue
  private table: ProtectTable<ProtectTableColumn>

  /**
   * @param client - Native Protect client instance.
   * @param plaintext - Value to encrypt.
   * @param opts - Table/column metadata describing where the ciphertext will be stored.
   */
  constructor(
    client: Client,
    plaintext: JsPlaintext | null,
    opts: EncryptOptions,
  ) {
    super()
    this.client = client
    this.plaintext = plaintext
    this.column = opts.column
    this.table = opts.table
  }

  /**
   * Bind a lock context so the encryption result is scoped to a specific user
   * identity. The matching context must be used again when decrypting.
   *
   * @param lockContext - Authorised lock context obtained via `LockContext.identify`.
   */
  public withLockContext(
    lockContext: LockContext,
  ): EncryptOperationWithLockContext {
    return new EncryptOperationWithLockContext(this, lockContext)
  }

  /**
   * Execute the encryption without a lock context. This honours any configured
   * audit metadata and propagates Protect.js error types on failure.
   */
  public async execute(): Promise<Result<Encrypted, ProtectError>> {
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

        if (
          typeof this.plaintext === 'number' &&
          Number.isNaN(this.plaintext)
        ) {
          throw new Error('[protect]: Cannot encrypt NaN value')
        }

        if (
          typeof this.plaintext === 'number' &&
          !Number.isFinite(this.plaintext)
        ) {
          throw new Error('[protect]: Cannot encrypt Infinity value')
        }

        const { metadata } = this.getAuditData()

        return await ffiEncrypt(this.client, {
          plaintext: this.plaintext,
          column: this.column.getName(),
          table: this.table.tableName,
          unverifiedContext: metadata,
        })
      },
      (error) => ({
        type: ProtectErrorTypes.EncryptionError,
        message: error.message,
      }),
    )
  }

  /**
   * Expose the underlying operation metadata for reuse by lock-context aware
   * decorators.
   *
   * @internal
   */
  public getOperation(): {
    client: Client
    plaintext: JsPlaintext | null
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

export class EncryptOperationWithLockContext extends ProtectOperation<Encrypted> {
  private operation: EncryptOperation
  private lockContext: LockContext

  /**
   * @param operation - Base operation containing encryption metadata.
   * @param lockContext - CTS-backed lock context.
   */
  constructor(operation: EncryptOperation, lockContext: LockContext) {
    super()
    this.operation = operation
    this.lockContext = lockContext
  }

  /**
   * Execute the encryption with a bound lock context, enforcing identity-aware
   * cryptographic controls.
   */
  public async execute(): Promise<Result<Encrypted, ProtectError>> {
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

        const { metadata } = this.getAuditData()
        const context = await this.lockContext.getLockContext()

        if (context.failure) {
          throw new Error(`[protect]: ${context.failure.message}`)
        }

        return await ffiEncrypt(client, {
          plaintext,
          column: column.getName(),
          table: table.tableName,
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
