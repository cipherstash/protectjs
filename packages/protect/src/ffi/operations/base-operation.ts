export type AuditConfig = {
  metadata?: Record<string, unknown>
}

export class BaseOperation<T> {
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
   * Get the audit metadata for this operation.
   */
  public getAuditMetadata(): Record<string, unknown> | undefined {
    return this.auditMetadata
  }
}
