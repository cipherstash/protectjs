import { type Result, withResult } from '@byteslice/result'
import type { ProtectTable, ProtectTableColumn } from '@cipherstash/schema'
import { type ProtectError, ProtectErrorTypes } from '../..'
import { logger } from '../../../../utils/logger'
import type { LockContext } from '../../identify'
import type { Client, Decrypted } from '../../types'
import { noClientError } from '../index'
import {
  encryptModelFields,
  encryptModelFieldsWithLockContext,
} from '../model-helpers'
import { ProtectOperation } from './base-operation'

/**
 * Thenable wrapper returned by {@link ProtectClient.encryptModel}. Converts
 * schema-marked fields on an object into EQL payloads while leaving other
 * properties untouched.
 */
export class EncryptModelOperation<
  T extends Record<string, unknown>,
> extends ProtectOperation<T> {
  private client: Client
  private model: Decrypted<T>
  private table: ProtectTable<ProtectTableColumn>

  constructor(
    client: Client,
    model: Decrypted<T>,
    table: ProtectTable<ProtectTableColumn>,
  ) {
    super()
    this.client = client
    this.model = model
    this.table = table
  }

  /**
   * Bind a lock context so encrypted fields inherit identity-aware protection.
   *
   * @param lockContext - CTS lock context resolved via {@link LockContext}.
   */
  public withLockContext(
    lockContext: LockContext,
  ): EncryptModelOperationWithLockContext<T> {
    return new EncryptModelOperationWithLockContext(this, lockContext)
  }

  /**
   * Execute the model encryption without a lock context. The resulting model
   * mirrors the input shape but with encrypted values.
   */
  public async execute(): Promise<Result<T, ProtectError>> {
    logger.debug('Encrypting model WITHOUT a lock context', {
      table: this.table.tableName,
    })

    return await withResult(
      async () => {
        if (!this.client) {
          throw noClientError()
        }

        const auditData = this.getAuditData()

        return await encryptModelFields<T>(
          this.model,
          this.table,
          this.client,
          auditData,
        )
      },
      (error) => ({
        type: ProtectErrorTypes.EncryptionError,
        message: error.message,
      }),
    )
  }

  public getOperation(): {
    client: Client
    model: Decrypted<T>
    table: ProtectTable<ProtectTableColumn>
  } {
    return {
      client: this.client,
      model: this.model,
      table: this.table,
    }
  }
}

/**
 * Lock-context aware variant of {@link EncryptModelOperation}. Ensures the
 * resulting ciphertexts can only be decrypted when the same lock context is
 * supplied later.
 */
export class EncryptModelOperationWithLockContext<
  T extends Record<string, unknown>,
> extends ProtectOperation<T> {
  private operation: EncryptModelOperation<T>
  private lockContext: LockContext

  constructor(operation: EncryptModelOperation<T>, lockContext: LockContext) {
    super()
    this.operation = operation
    this.lockContext = lockContext
  }

  /**
   * Execute the encryption with a bound lock context. CTS token fetch failures
   * are surfaced through the Protect error taxonomy.
   */
  public async execute(): Promise<Result<T, ProtectError>> {
    return await withResult(
      async () => {
        const { client, model, table } = this.operation.getOperation()

        logger.debug('Encrypting model WITH a lock context', {
          table: table.tableName,
        })

        if (!client) {
          throw noClientError()
        }

        const context = await this.lockContext.getLockContext()

        if (context.failure) {
          throw new Error(`[protect]: ${context.failure.message}`)
        }

        const auditData = this.getAuditData()

        return await encryptModelFieldsWithLockContext<T>(
          model,
          table,
          client,
          context.data,
          auditData,
        )
      },
      (error) => ({
        type: ProtectErrorTypes.EncryptionError,
        message: error.message,
      }),
    )
  }
}
