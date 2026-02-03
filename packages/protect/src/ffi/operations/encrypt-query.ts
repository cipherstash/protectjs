import { type Result, withResult } from '@byteslice/result'
import {
  type JsPlaintext,
  encryptQuery as ffiEncryptQuery,
} from '@cipherstash/protect-ffi'
import { type ProtectError, ProtectErrorTypes } from '../..'
import { logger } from '../../../../utils/logger'
import type { LockContext } from '../../identify'
import type { Client, Encrypted, EncryptQueryOptions } from '../../types'
import { noClientError } from '../index'
import { ProtectOperation } from './base-operation'
import { resolveIndexType } from '../helpers/infer-index-type'
import { validateNumericValue, assertValueIndexCompatibility } from '../helpers/validation'

/**
 * @internal Use {@link ProtectClient.encryptQuery} instead.
 */
export class EncryptQueryOperation extends ProtectOperation<Encrypted> {
  constructor(
    private client: Client,
    private plaintext: JsPlaintext | null,
    private opts: EncryptQueryOptions,
  ) {
    super()
  }

  public withLockContext(lockContext: LockContext): EncryptQueryOperationWithLockContext {
    return new EncryptQueryOperationWithLockContext(this.client, this.plaintext, this.opts, lockContext, this.auditMetadata)
  }

  public async execute(): Promise<Result<Encrypted, ProtectError>> {
    logger.debug('Encrypting query', {
      column: this.opts.column.getName(),
      table: this.opts.table.tableName,
      queryType: this.opts.queryType,
    })

    if (this.plaintext === null) {
      return { data: null }
    }

    const validationError = validateNumericValue(this.plaintext)
    if (validationError?.failure) {
      return { failure: validationError.failure }
    }

    return await withResult(
      async () => {
        if (!this.client) throw noClientError()

        const { metadata } = this.getAuditData()

        const { indexType, queryOp } = resolveIndexType(
          this.opts.column,
          this.opts.queryType,
          this.plaintext
        )

        // Validate value/index compatibility
        assertValueIndexCompatibility(
          this.plaintext,
          indexType,
          this.opts.column.getName()
        )

        return await ffiEncryptQuery(this.client, {
          plaintext: this.plaintext as JsPlaintext,
          column: this.opts.column.getName(),
          table: this.opts.table.tableName,
          indexType,
          queryOp,
          unverifiedContext: metadata,
        })
      },
      (error) => ({
        type: ProtectErrorTypes.EncryptionError,
        message: error.message,
      }),
    )
  }

  public getOperation() {
    return { client: this.client, plaintext: this.plaintext, ...this.opts }
  }
}

/**
 * @internal Use {@link ProtectClient.encryptQuery} with `.withLockContext()` instead.
 */
export class EncryptQueryOperationWithLockContext extends ProtectOperation<Encrypted> {
  constructor(
    private client: Client,
    private plaintext: JsPlaintext | null,
    private opts: EncryptQueryOptions,
    private lockContext: LockContext,
    auditMetadata?: Record<string, unknown>,
  ) {
    super()
    this.auditMetadata = auditMetadata
  }

  public async execute(): Promise<Result<Encrypted, ProtectError>> {
    if (this.plaintext === null) {
      return { data: null }
    }

    const validationError = validateNumericValue(this.plaintext)
    if (validationError?.failure) {
      return { failure: validationError.failure }
    }

    const lockContextResult = await this.lockContext.getLockContext()
    if (lockContextResult.failure) {
      return { failure: lockContextResult.failure }
    }

    const { ctsToken, context } = lockContextResult.data

    return await withResult(
      async () => {
        if (!this.client) throw noClientError()

        const { metadata } = this.getAuditData()

        const { indexType, queryOp } = resolveIndexType(
          this.opts.column,
          this.opts.queryType,
          this.plaintext
        )

        // Validate value/index compatibility
        assertValueIndexCompatibility(
          this.plaintext,
          indexType,
          this.opts.column.getName()
        )

        return await ffiEncryptQuery(this.client, {
          plaintext: this.plaintext as JsPlaintext,
          column: this.opts.column.getName(),
          table: this.opts.table.tableName,
          indexType,
          queryOp,
          lockContext: context,
          serviceToken: ctsToken,
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
