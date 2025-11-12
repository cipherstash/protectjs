import type { Result } from '@byteslice/result'
import type { ProtectDynamoDBError } from '../types'

/**
 * Optional audit metadata forwarded to CipherStash so DynamoDB operations can
 * be correlated with business context (tickets, principals, etc.).
 */
export type AuditConfig = {
  metadata?: Record<string, unknown>
}

/** Derived audit payload consumed internally by the FFI bridge. */
export type AuditData = {
  metadata?: Record<string, unknown>
}

/**
 * Dependency injection hooks for DynamoDB operations. Allow callers to wire in
 * structured logging or custom error handling strategies.
 */
export type DynamoDBOperationOptions = {
  logger?: {
    error: (message: string, error: Error) => void
  }
  errorHandler?: (error: ProtectDynamoDBError) => void
}

/**
 * Base class shared by all DynamoDB operations. Provides audit chaining,
 * Promise-like semantics, and centralised logger/error hooks.
 */
export abstract class DynamoDBOperation<T> {
  protected auditMetadata?: Record<string, unknown>
  protected logger?: DynamoDBOperationOptions['logger']
  protected errorHandler?: DynamoDBOperationOptions['errorHandler']

  constructor(options?: DynamoDBOperationOptions) {
    this.logger = options?.logger
    this.errorHandler = options?.errorHandler
  }

  /**
   * Attach audit metadata to this operation. Can be chained.
   */
  audit(config: AuditConfig): this {
    this.auditMetadata = config.metadata
    return this
  }

  /**
   * Get the audit metadata for this operation.
   */
  protected getAuditData(): AuditData {
    return {
      metadata: this.auditMetadata,
    }
  }

  /**
   * Execute the operation and return a Result
   */
  abstract execute(): Promise<Result<T, ProtectDynamoDBError>>

  /**
   * Make the operation thenable
   */
  public then<TResult1 = Result<T, ProtectDynamoDBError>, TResult2 = never>(
    onfulfilled?:
      | ((
          value: Result<T, ProtectDynamoDBError>,
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }
}
