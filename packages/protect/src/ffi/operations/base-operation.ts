import type { Result } from '@byteslice/result'
import type { ProtectError } from '../..'

/**
 * Optional auditing metadata appended to every ZeroKMS call. Helps signal the
 * application context (e.g., user ID, ticket number) inside CipherStash audit
 * trails for downstream compliance teams.
 */
export type AuditConfig = {
  metadata?: Record<string, unknown>
}

/**
 * Derived audit payload forwarded to the native FFI layer.
 */
export type AuditData = {
  metadata?: Record<string, unknown>
}

/**
 * Base class for all Protect.js operations. Wraps asynchronous execution in a
 * thenable interface so callers can treat operations like Promises while still
 * accessing ergonomic helpers such as `.withLockContext()`.
 */
export abstract class ProtectOperation<T> {
  protected auditMetadata?: Record<string, unknown>

  /**
   * Attach audit metadata to this operation. Chainable helper used by
   * enterprise customers who need per-request audit trails for SOC2 or HIPAA.
   *
   * @param config - Configuration for ZeroKMS audit logging.
   */
  audit(config: AuditConfig): this {
    this.auditMetadata = config.metadata
    return this
  }

  /** Retrieve the audit bundle that will be forwarded to ZeroKMS. */
  public getAuditData(): AuditData {
    return {
      metadata: this.auditMetadata,
    }
  }

  /** Execute the underlying FFI call and return a typed `Result`. */
  abstract execute(): Promise<Result<T, ProtectError>>

  /**
   * Make the operation thenable so it behaves like a Promise while preserving
   * the Result contract.
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
