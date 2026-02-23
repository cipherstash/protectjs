import { getErrorCode } from '@/encryption/ffi/helpers/error-code'
import { type EncryptionError, EncryptionErrorTypes } from '@/errors'
import type { LockContext } from '@/identity'
import type { Client, EncryptQueryOptions, Encrypted } from '@/types'
import { createRequestLogger } from '@/utils/logger'
import { type Result, withResult } from '@byteslice/result'
import {
  type JsPlaintext,
  encryptQuery as ffiEncryptQuery,
} from '@cipherstash/protect-ffi'
import { resolveIndexType } from '../helpers/infer-index-type'
import {
  assertValueIndexCompatibility,
  validateNumericValue,
} from '../helpers/validation'
import { noClientError } from '../index'
import { EncryptionOperation } from './base-operation'

/**
 * @internal Use {@link EncryptionClient.encryptQuery} instead.
 */
export class EncryptQueryOperation extends EncryptionOperation<Encrypted> {
  constructor(
    private client: Client,
    private plaintext: JsPlaintext | null,
    private opts: EncryptQueryOptions,
  ) {
    super()
  }

  public withLockContext(
    lockContext: LockContext,
  ): EncryptQueryOperationWithLockContext {
    return new EncryptQueryOperationWithLockContext(
      this.client,
      this.plaintext,
      this.opts,
      lockContext,
      this.auditMetadata,
    )
  }

  public async execute(): Promise<Result<Encrypted, EncryptionError>> {
    const log = createRequestLogger()
    log.set({
      op: 'encryptQuery',
      table: this.opts.table.tableName,
      column: this.opts.column.getName(),
      queryType: this.opts.queryType,
      lockContext: false,
    })

    if (this.plaintext === null || this.plaintext === undefined) {
      log.emit()
      return { data: null }
    }

    const validationError = validateNumericValue(this.plaintext)
    if (validationError?.failure) {
      log.emit()
      return { failure: validationError.failure }
    }

    const result = await withResult(
      async () => {
        if (!this.client) throw noClientError()

        const { metadata } = this.getAuditData()

        const { indexType, queryOp } = resolveIndexType(
          this.opts.column,
          this.opts.queryType,
          this.plaintext,
        )

        // Validate value/index compatibility
        assertValueIndexCompatibility(
          this.plaintext,
          indexType,
          this.opts.column.getName(),
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

  public getOperation() {
    return { client: this.client, plaintext: this.plaintext, ...this.opts }
  }
}

/**
 * @internal Use {@link EncryptionClient.encryptQuery} with `.withLockContext()` instead.
 */
export class EncryptQueryOperationWithLockContext extends EncryptionOperation<Encrypted> {
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

  public async execute(): Promise<Result<Encrypted, EncryptionError>> {
    const log = createRequestLogger()
    log.set({
      op: 'encryptQuery',
      table: this.opts.table.tableName,
      column: this.opts.column.getName(),
      queryType: this.opts.queryType,
      lockContext: true,
    })

    if (this.plaintext === null || this.plaintext === undefined) {
      log.emit()
      return { data: null }
    }

    const validationError = validateNumericValue(this.plaintext)
    if (validationError?.failure) {
      log.emit()
      return { failure: validationError.failure }
    }

    const lockContextResult = await this.lockContext.getLockContext()
    if (lockContextResult.failure) {
      log.emit()
      return { failure: lockContextResult.failure }
    }

    const { ctsToken, context } = lockContextResult.data

    const result = await withResult(
      async () => {
        if (!this.client) throw noClientError()

        const { metadata } = this.getAuditData()

        const { indexType, queryOp } = resolveIndexType(
          this.opts.column,
          this.opts.queryType,
          this.plaintext,
        )

        // Validate value/index compatibility
        assertValueIndexCompatibility(
          this.plaintext,
          indexType,
          this.opts.column.getName(),
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
