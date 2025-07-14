import type { Result } from '@byteslice/result'
import type { ProtectError } from '../..'

export type AuditConfig = {
  metadata?: Record<string, unknown>
}

export type AuditData = {
  metadata?: Record<string, unknown>
}

export abstract class ProtectOperation<T> {
  protected auditMetadata?: Record<string, unknown>

  /**
   * Attach audit metadata to this operation. Can be chained.
   * @param config Configuration for ZeroKMS audit logging
   * @param config.metadata Arbitrary JSON object for appending metadata to the audit log
   */
  audit(config: AuditConfig): this {
    this.auditMetadata = config.metadata
    return this
  }

  /**
   * Get the audit data for this operation.
   */
  public getAuditData(): AuditData {
    return {
      metadata: this.auditMetadata,
    }
  }

  /**
   * Execute the operation and return a Result
   */
  abstract execute(): Promise<Result<T, ProtectError>>

  /**
   * Make the operation thenable
   */
  public then<TResult1 = Result<T, ProtectError>, TResult2 = never>(
    onfulfilled?:
      | ((value: Result<T, ProtectError>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }
}
