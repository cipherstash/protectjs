import { type Result, withResult } from '@byteslice/result'
import { type ProtectError, ProtectErrorTypes } from '../..'
import { logger } from '../../../../utils/logger'
import type { LockContext } from '../../identify'
import type { Client, Decrypted } from '../../types'
import { noClientError } from '../index'
import {
  bulkDecryptModels,
  bulkDecryptModelsWithLockContext,
} from '../model-helpers'
import { ProtectOperation } from './base-operation'

/**
 * Thenable wrapper returned by {@link ProtectClient.bulkDecryptModels}. Turns
 * arrays of encrypted models back into plaintext objects in a single request.
 */
export class BulkDecryptModelsOperation<
  T extends Record<string, unknown>,
> extends ProtectOperation<Decrypted<T>[]> {
  private client: Client
  private models: T[]

  constructor(client: Client, models: T[]) {
    super()
    this.client = client
    this.models = models
  }

  /**
   * Bind a lock context so every model decrypted is authorised by the
   * associated user claims.
   *
   * @param lockContext - CTS lock context resolved via {@link LockContext}.
   */
  public withLockContext(
    lockContext: LockContext,
  ): BulkDecryptModelsOperationWithLockContext<T> {
    return new BulkDecryptModelsOperationWithLockContext(this, lockContext)
  }

  /**
   * Execute the bulk model decryption without identity scoping. The returned
   * array preserves the input ordering.
   */
  public async execute(): Promise<Result<Decrypted<T>[], ProtectError>> {
    logger.debug('Bulk decrypting models WITHOUT a lock context')

    return await withResult(
      async () => {
        if (!this.client) {
          throw noClientError()
        }

        const auditData = this.getAuditData()

        return await bulkDecryptModels<T>(this.models, this.client, auditData)
      },
      (error) => ({
        type: ProtectErrorTypes.DecryptionError,
        message: error.message,
      }),
    )
  }

  public getOperation(): {
    client: Client
    models: T[]
  } {
    return {
      client: this.client,
      models: this.models,
    }
  }
}

/**
 * Lock-context aware variant of {@link BulkDecryptModelsOperation}. All models
 * are decrypted only when the provided CTS token authorises access.
 */
export class BulkDecryptModelsOperationWithLockContext<
  T extends Record<string, unknown>,
> extends ProtectOperation<Decrypted<T>[]> {
  private operation: BulkDecryptModelsOperation<T>
  private lockContext: LockContext

  constructor(
    operation: BulkDecryptModelsOperation<T>,
    lockContext: LockContext,
  ) {
    super()
    this.operation = operation
    this.lockContext = lockContext
  }

  /**
   * Execute the lock-context scoped bulk model decryption. CTS token failures
   * propagate via the Protect error taxonomy.
   */
  public async execute(): Promise<Result<Decrypted<T>[], ProtectError>> {
    return await withResult(
      async () => {
        const { client, models } = this.operation.getOperation()

        logger.debug('Bulk decrypting models WITH a lock context')

        if (!client) {
          throw noClientError()
        }

        const context = await this.lockContext.getLockContext()

        if (context.failure) {
          throw new Error(`[protect]: ${context.failure.message}`)
        }

        const auditData = this.getAuditData()

        return await bulkDecryptModelsWithLockContext<T>(
          models,
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
