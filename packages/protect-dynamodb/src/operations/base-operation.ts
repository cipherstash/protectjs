import type { ProtectDynamoDBError } from '../types'
import type { Result } from '@byteslice/result'

export type AuditConfig = {
  metadata?: Record<string, unknown>
}

export type DynamoDBOperationOptions = {
  logger?: {
    error: (message: string, error: Error) => void
  }
  errorHandler?: (error: ProtectDynamoDBError) => void
}

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
  protected getAuditMetadata(): Record<string, unknown> | undefined {
    return this.auditMetadata
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
