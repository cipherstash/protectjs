import type { CipherStashEncryptionBinding } from './encryption-client'

/**
 * Per-extension context passed to every codec factory.
 *
 * Carries the resolved client binding plus the optional observability
 * hook. Codec factories close over this object so each
 * `cipherstashEncryption({...})` call gets a fresh codec graph with
 * its own client / contract / event sink.
 */
export interface CipherStashCodecContext {
  readonly binding: CipherStashEncryptionBinding
  readonly emit: (event: CipherStashEncryptionEvent) => void
}

/**
 * Discriminator on every emitted observability event. Maps onto the
 * three SDK round-trip kinds the integration drives.
 */
export type CipherStashEncryptionEventKind =
  | 'bulkEncrypt'
  | 'bulkDecrypt'
  | 'encryptQuery'

/**
 * Structured payload emitted on every SDK round-trip — both success
 * and failure. Surfaces enough information for users to:
 *   - count requests per kind / codec / column,
 *   - measure latency p50 / p99,
 *   - alert on failure rate.
 *
 * The payload deliberately excludes plaintext / ciphertext to keep
 * default behavior safe in dev logging.
 */
export interface CipherStashEncryptionEvent {
  readonly kind: CipherStashEncryptionEventKind
  readonly codecId: string
  readonly batchSize: number
  readonly durationMs: number
  readonly table: string | undefined
  readonly column: string | undefined
  /** When defined, the round-trip failed with this error. */
  readonly error: unknown | undefined
}

/**
 * Shape of the optional `onEvent` hook accepted by
 * `cipherstashEncryption({ onEvent })`.
 */
export type CipherStashEncryptionEventHook = (
  event: CipherStashEncryptionEvent,
) => void

/**
 * Default event hook used when `onEvent` is omitted. In production
 * this is a no-op. In dev / test (`NODE_ENV !== 'production'`), it
 * logs a structured `console.debug(...)` line so the developer can
 * see the round-trips without instrumenting their own hook.
 */
export function defaultEventHook(event: CipherStashEncryptionEvent): void {
  if (process.env.NODE_ENV === 'production') return
  const target =
    event.table && event.column ? `${event.table}.${event.column}` : '<no-col>'
  if (event.error) {
    console.debug(
      `[cipherstash] ${event.kind}(${event.batchSize}) ${target} failed in ${event.durationMs.toFixed(1)}ms`,
      event.error,
    )
  } else {
    console.debug(
      `[cipherstash] ${event.kind}(${event.batchSize}) ${target} ok in ${event.durationMs.toFixed(1)}ms`,
    )
  }
}

/**
 * Wrap an async SDK call with timing + event emission. Accepts any
 * thenable (so `BulkEncryptOperation` / `BulkDecryptOperation` /
 * `BatchEncryptQueryOperation` work without their full Promise
 * surface). Throws on failure so the caller can still propagate; the
 * event fires both on success and on failure with `error` populated.
 * Caller decides whether to translate into a structured
 * `CipherStashCodecError`.
 */
export async function emitTimed<T>(
  ctx: CipherStashCodecContext,
  base: Omit<CipherStashEncryptionEvent, 'durationMs' | 'error'>,
  body: () => PromiseLike<T>,
): Promise<T> {
  const start = performance.now()
  try {
    const result = await body()
    ctx.emit({
      ...base,
      durationMs: performance.now() - start,
      error: undefined,
    })
    return result
  } catch (error) {
    ctx.emit({
      ...base,
      durationMs: performance.now() - start,
      error,
    })
    throw error
  }
}
