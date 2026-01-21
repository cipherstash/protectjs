import { type Result, withResult } from '@byteslice/result'
import { encryptQueryBulk } from '@cipherstash/protect-ffi'
import { type ProtectError, ProtectErrorTypes } from '../..'
import { logger } from '../../../../utils/logger'
import type { LockContext } from '../../identify'
import type {
  Client,
  EncryptedSearchTerm,
  QuerySearchTerm,
} from '../../types'
import { noClientError } from '../index'
import { ProtectOperation } from './base-operation'

/**
 * @internal
 * Operation for encrypting multiple query terms with explicit index type control.
 * See {@link ProtectClient.createQuerySearchTerms} for the public interface and documentation.
 */
export class QuerySearchTermsOperation extends ProtectOperation<
  EncryptedSearchTerm[]
> {
  private client: Client
  private terms: QuerySearchTerm[]

  constructor(client: Client, terms: QuerySearchTerm[]) {
    super()
    this.client = client
    this.terms = terms
  }

  public withLockContext(
    lockContext: LockContext,
  ): QuerySearchTermsOperationWithLockContext {
    return new QuerySearchTermsOperationWithLockContext(this, lockContext)
  }

  public getOperation() {
    return { client: this.client, terms: this.terms }
  }

  public async execute(): Promise<Result<EncryptedSearchTerm[], ProtectError>> {
    logger.debug('Creating query search terms', {
      termCount: this.terms.length,
    })

    return await withResult(
      async () => {
        if (!this.client) {
          throw noClientError()
        }

        const { metadata } = this.getAuditData()

        const encrypted = await encryptQueryBulk(this.client, {
          queries: this.terms.map((term) => ({
            plaintext: term.value,
            column: term.column.getName(),
            table: term.table.tableName,
            indexType: term.indexType,
            queryOp: term.queryOp,
          })),
          unverifiedContext: metadata,
        })

        return this.terms.map((term, index) => {
          if (term.returnType === 'composite-literal') {
            return `(${JSON.stringify(JSON.stringify(encrypted[index]))})`
          }

          if (term.returnType === 'escaped-composite-literal') {
            return `${JSON.stringify(`(${JSON.stringify(JSON.stringify(encrypted[index]))})`)}`
          }

          return encrypted[index]
        })
      },
      (error) => ({
        type: ProtectErrorTypes.EncryptionError,
        message: error.message,
      }),
    )
  }
}

export class QuerySearchTermsOperationWithLockContext extends ProtectOperation<
  EncryptedSearchTerm[]
> {
  private operation: QuerySearchTermsOperation
  private lockContext: LockContext

  constructor(
    operation: QuerySearchTermsOperation,
    lockContext: LockContext,
  ) {
    super()
    this.operation = operation
    this.lockContext = lockContext
  }

  public async execute(): Promise<Result<EncryptedSearchTerm[], ProtectError>> {
    return await withResult(
      async () => {
        const { client, terms } = this.operation.getOperation()

        logger.debug('Creating query search terms WITH lock context', {
          termCount: terms.length,
        })

        if (!client) {
          throw noClientError()
        }

        const { metadata } = this.getAuditData()
        const context = await this.lockContext.getLockContext()

        if (context.failure) {
          throw new Error(`[protect]: ${context.failure.message}`)
        }

        const encrypted = await encryptQueryBulk(client, {
          queries: terms.map((term) => ({
            plaintext: term.value,
            column: term.column.getName(),
            table: term.table.tableName,
            indexType: term.indexType,
            queryOp: term.queryOp,
            lockContext: context.data.context,
          })),
          serviceToken: context.data.ctsToken,
          unverifiedContext: metadata,
        })

        return terms.map((term, index) => {
          if (term.returnType === 'composite-literal') {
            return `(${JSON.stringify(JSON.stringify(encrypted[index]))})`
          }

          if (term.returnType === 'escaped-composite-literal') {
            return `${JSON.stringify(`(${JSON.stringify(JSON.stringify(encrypted[index]))})`)}`
          }

          return encrypted[index]
        })
      },
      (error) => ({
        type: ProtectErrorTypes.EncryptionError,
        message: error.message,
      }),
    )
  }
}
