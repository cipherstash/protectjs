import { type Result, withResult } from '@byteslice/result'
import { type ProtectError, ProtectErrorTypes } from '../..'
import { logger } from '../../../../utils/logger'
import type { LockContext } from '../../identify'
import type { Client, Decrypted } from '../../types'
import { noClientError } from '../index'
import {
  decryptModelFields,
  decryptModelFieldsWithLockContext,
} from '../model-helpers'
import { ProtectOperation } from './base-operation'

/**
 * Thenable wrapper returned by {@link ProtectClient.decryptModel}. Restores
 * encrypted fields on a model while preserving other properties.
 */
export class DecryptModelOperation<
  T extends Record<string, unknown>,
> extends ProtectOperation<Decrypted<T>> {
  private client: Client
  private model: T

  constructor(client: Client, model: T) {
    super()
    this.client = client
    this.model = model
  }

  /**
   * Bind a lock context so decryption is authorised by the user's identity.
   *
   * @param lockContext - CTS lock context resolved via {@link LockContext}.
   */
  public withLockContext(
    lockContext: LockContext,
  ): DecryptModelOperationWithLockContext<T> {
    return new DecryptModelOperationWithLockContext(this, lockContext)
  }

  /**
   * Execute the model decryption without identity scoping. The resulting model
   * mirrors the input shape with plaintext values restored.
   */
  public async execute(): Promise<Result<Decrypted<T>, ProtectError>> {
    logger.debug('Decrypting model WITHOUT a lock context')

    return await withResult(
      async () => {
        if (!this.client) {
          throw noClientError()
        }

        const auditData = this.getAuditData()

        return await decryptModelFields<T>(this.model, this.client, auditData)
      },
      (error) => ({
        type: ProtectErrorTypes.DecryptionError,
        message: error.message,
      }),
    )
  }

  public getOperation(): {
    client: Client
    model: T
  } {
    return {
      client: this.client,
      model: this.model,
    }
  }
}

/**
 * Lock-context aware variant of {@link DecryptModelOperation}. Verifies the
 * supplied CTS token before returning plaintext values.
 */
export class DecryptModelOperationWithLockContext<
  T extends Record<string, unknown>,
> extends ProtectOperation<Decrypted<T>> {
  private operation: DecryptModelOperation<T>
  private lockContext: LockContext

  constructor(operation: DecryptModelOperation<T>, lockContext: LockContext) {
    super()
    this.operation = operation
    this.lockContext = lockContext
  }

  /**
   * Execute the lock-context scoped decryption. CTS token failures propagate
   * through the Protect error taxonomy.
   */
  public async execute(): Promise<Result<Decrypted<T>, ProtectError>> {
    return await withResult(
      async () => {
        const { client, model } = this.operation.getOperation()

        logger.debug('Decrypting model WITH a lock context')

        if (!client) {
          throw noClientError()
        }

        const context = await this.lockContext.getLockContext()

        if (context.failure) {
          throw new Error(`[protect]: ${context.failure.message}`)
        }

        const auditData = this.getAuditData()

        return await decryptModelFieldsWithLockContext<T>(
          model,
          client,
          context.data,
          auditData,
        )
      },
      (error) => ({
        type: ProtectErrorTypes.DecryptionError,
        message: error.message,
      }),
    )
  }
}
