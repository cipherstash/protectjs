import type { ProtectTable, ProtectTableColumn } from '@cipherstash/schema'
import { buildEncryptConfig } from '@cipherstash/schema'
import { ProtectClient } from './ffi'
import type { KeysetIdentifier } from './types'

/**
 * Machine-readable error categories raised by Protect.js runtime operations.
 * These string literals are part of the public Result contract—downstream
 * callers should branch on them rather than inspecting message text.
 *
 * @remarks
 * - The values mirror the thin error taxonomy surfaced by CipherStash ZeroKMS.
 * - See the Protect.js README for guidance on end-user messaging:
 *   https://github.com/cipherstash/protectjs/blob/main/README.md
 */
export const ProtectErrorTypes = {
  ClientInitError: 'ClientInitError',
  EncryptionError: 'EncryptionError',
  DecryptionError: 'DecryptionError',
  LockContextError: 'LockContextError',
  CtsTokenError: 'CtsTokenError',
}

/**
 * Standardised error shape returned inside the `failure` branch of any
 * Protect.js Result. This mirrors the enterprise support expectations for
 * CipherStash customers—every failure exposes a typed category and a
 * descriptive, developer-friendly message.
 */
export interface ProtectError {
  type: (typeof ProtectErrorTypes)[keyof typeof ProtectErrorTypes]
  message: string
}

type AtLeastOneCsTable<T> = [T, ...T[]]

/**
 * Configuration contract for {@link protect}. Supply your CipherStash workspace
 * credentials alongside the Protect schema definitions you generated with
 * `csTable`. Each option maps to a concept documented in the Protect.js README
 * and on <https://cipherstash.com/>.
 */
export type ProtectClientConfig = {
  /**
   * One or more Protect schema definitions constructed via `csTable`. At least
   * one schema is required so the Protect client can provision index metadata
   * with ZeroKMS.
   */
  schemas: AtLeastOneCsTable<ProtectTable<ProtectTableColumn>>
  /**
   * Optional override for the CipherStash workspace CRN. In most applications
   * this is auto-discovered from `cipherstash.toml`, but explicit configuration
   * can simplify multi-tenant deployments.
   */
  workspaceCrn?: string
  /**
   * CipherStash API access key. Provide it explicitly when not loading from
   * environment variables or when running in a long-lived process manager that
   * injects secrets at runtime.
   */
  accessKey?: string
  /**
   * CipherStash client identifier used to authenticate against ZeroKMS.
   */
  clientId?: string
  /**
   * CipherStash client key—the symmetric key material combined with ZeroKMS to
   * derive per-value encryption keys.
   */
  clientKey?: string
  /**
   * Optional keyset selector that instructs ZeroKMS to resolve a tenant- or
   * environment-specific key hierarchy. Pass either the UUID or a friendly name
   * that you have mapped inside the CipherStash dashboard.
   */
  keyset?: KeysetIdentifier
}

function isValidUuid(uuid: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(uuid)
}

/**
 * Initialize the Protect.js client and hydrate the native ZeroKMS runtime.
 *
 * @remarks
 * - Validation: Throws when no schemas are supplied or when the provided keyset
 *   identifier is not a valid UUID. This fail-fast behaviour prevents
 *   accidentally starting a client that cannot service encryption requests.
 * - Network: Calls CipherStash ZeroKMS over HTTPS to fetch encryption material
 *   and synchronise the schema definition. Ensure the host environment has the
 *   required `CS_*` credentials configured.
 * - Key management: When `keyset` is specified the client will scope all future
 *   operations to that tenant or environment, aligning with CipherStash’s
 *   zero-trust key management model (see https://cipherstash.com/).
 *
 * @param config - Workspace credentials and the schema definitions created via
 * `csTable`.
 * @returns A fully initialised `ProtectClient` instance ready for encryption,
 * decryption, and search-term generation.
 *
 * @example
 * ```ts
 * import { protect, csTable, csColumn } from '@cipherstash/protect'
 *
 * const users = csTable('users', {
 *   email: csColumn('email').freeTextSearch().equality(),
 * })
 *
 * const client = await protect({
 *   schemas: [users],
 *   keyset: { name: 'production' },
 * })
 * ```
 */
export const protect = async (
  config: ProtectClientConfig,
): Promise<ProtectClient> => {
  const { schemas } = config

  if (!schemas.length) {
    throw new Error(
      '[protect]: At least one csTable must be provided to initialize the protect client',
    )
  }

  if (
    config.keyset &&
    'id' in config.keyset &&
    !isValidUuid(config.keyset.id)
  ) {
    throw new Error(
      '[protect]: Invalid UUID provided for keyset id. Must be a valid UUID.',
    )
  }

  const clientConfig = {
    workspaceCrn: config.workspaceCrn,
    accessKey: config.accessKey,
    clientId: config.clientId,
    clientKey: config.clientKey,
    keyset: config.keyset,
  }

  const client = new ProtectClient(clientConfig.workspaceCrn)
  const encryptConfig = buildEncryptConfig(...schemas)

  const result = await client.init({
    encryptConfig,
    ...clientConfig,
  })

  if (result.failure) {
    throw new Error(`[protect]: ${result.failure.message}`)
  }

  return result.data
}

export type { Result } from '@byteslice/result'
export type { ProtectClient } from './ffi'
export { csTable, csColumn, csValue } from '@cipherstash/schema'
export type {
  ProtectColumn,
  ProtectTable,
  ProtectTableColumn,
  ProtectValue,
} from '@cipherstash/schema'
export * from './helpers'
export * from './identify'
export * from './types'
