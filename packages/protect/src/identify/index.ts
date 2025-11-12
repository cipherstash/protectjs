import { type Result, withResult } from '@byteslice/result'
import { type ProtectError, ProtectErrorTypes } from '..'
import { loadWorkSpaceId } from '../../../utils/config'
import { logger } from '../../../utils/logger'

/**
 * Regions currently supported by CipherStash's Ciphertext Token Service (CTS).
 * Lock contexts are scoped to a region to enforce compliance boundaries.
 */
export type CtsRegions = 'ap-southeast-2'

/**
 * Behavioural options for `LockContext.identify`. Primarily used by internal
 * tooling when controlling how CTS tokens are fetched or cached.
 */
export type IdentifyOptions = {
  fetchFromCts?: boolean
}

/**
 * Auth token returned by CipherStash CTS. Protect.js treats this as opaque; it
 * carries the cryptographic proof that ties encrypted data to a specific user.
 */
export type CtsToken = {
  accessToken: string
  expiry: number
}

/**
 * Lock context claims that describe the end-user identity. The default claim is
 * `sub`, aligning with the OpenID Connect subject identifier.
 */
export type Context = {
  identityClaim: string[]
}

/**
 * Initialiser options for {@link LockContext}. You can pre-load a CTS token to
 * reuse an existing authentication flow or override the default identity claim.
 */
export type LockContextOptions = {
  context?: Context
  ctsToken?: CtsToken
}

/**
 * Response returned from {@link LockContext.getLockContext}, combining both the
 * CTS token and the identity claim metadata.
 */
export type GetLockContextResponse = {
  ctsToken: CtsToken
  context: Context
}

/**
 * Lock contexts enable identity-aware encryption, ensuring the same JWT that
 * encrypts a value must also decrypt it. This class fetches and caches CTS
 * tokens from CipherStash ZeroKMS and keeps track of the active identity
 * claims.
 *
 * @remarks
 * - Workspace resolution: The constructor reads workspace configuration from
 *   `cipherstash.toml` or environment variables using `loadWorkSpaceId`.
 * - Logging: All operations emit structured debug logs via the shared
 *   CipherStash logger to help with SOC2-ready audit trails.
 */
export class LockContext {
  private ctsToken: CtsToken | undefined
  private workspaceId: string
  private context: Context

  constructor({
    context = { identityClaim: ['sub'] },
    ctsToken,
  }: LockContextOptions = {}) {
    const workspaceId = loadWorkSpaceId()

    if (!workspaceId) {
      throw new Error(
        'You have not defined a workspace ID in your config file, or the CS_WORKSPACE_ID environment variable.',
      )
    }

    if (ctsToken) {
      this.ctsToken = ctsToken
    }

    this.workspaceId = workspaceId
    this.context = context
    logger.debug('Successfully initialized the EQL lock context.')
  }

  /**
   * Authorise a user's session token with CipherStash CTS and bind the resulting
   * access token to this lock context.
   *
   * @param jwtToken - The end-user JWT obtained from your identity provider
   *   (e.g., Clerk). The token must contain the identity claim configured for
   *   this lock context.
   * @returns A Result whose `data` branch contains the hydrated {@link LockContext}.
   *
   * @example
   * ```ts
   * const lc = new LockContext()
   * const identifyResult = await lc.identify(userJwt)
   * if (identifyResult.failure) throw identifyResult.failure
   * const lockContext = identifyResult.data
   * await protectClient.encrypt('sensitive', options).withLockContext(lockContext)
   * ```
   */
  async identify(jwtToken: string): Promise<Result<LockContext, ProtectError>> {
    const workspaceId = this.workspaceId

    const ctsEndoint =
      process.env.CS_CTS_ENDPOINT ||
      'https://ap-southeast-2.aws.auth.viturhosted.net'

    const ctsFetchResult = await withResult(
      () =>
        fetch(`${ctsEndoint}/api/authorize`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            workspaceId,
            oidcToken: jwtToken,
          }),
        }),
      (error) => ({
        type: ProtectErrorTypes.CtsTokenError,
        message: error.message,
      }),
    )

    if (ctsFetchResult.failure) {
      return ctsFetchResult
    }

    const identifiedLockContext = await withResult(
      async () => {
        const ctsToken = (await ctsFetchResult.data.json()) as CtsToken

        if (!ctsToken.accessToken) {
          throw new Error(
            'The response from the CipherStash API did not contain an access token. Please contact support.',
          )
        }

        this.ctsToken = ctsToken
        return this
      },
      (error) => ({
        type: ProtectErrorTypes.CtsTokenError,
        message: error.message,
      }),
    )

    return identifiedLockContext
  }

  /**
   * Retrieve the CTS token and context claims that need to be attached to
   * encryption/decryption operations.
   *
   * @returns A Result wrapping the token and context. Fails when
   * {@link identify} has not been called or when no CTS token is present.
   */
  getLockContext(): Promise<Result<GetLockContextResponse, ProtectError>> {
    return withResult(
      () => {
        if (!this.ctsToken?.accessToken && !this.ctsToken?.expiry) {
          throw new Error(
            'The CTS token is not set. Please call identify() with a users JWT token, or pass an existing CTS token to the LockContext constructor before calling getLockContext().',
          )
        }

        return {
          context: this.context,
          ctsToken: this.ctsToken,
        }
      },
      (error) => ({
        type: ProtectErrorTypes.CtsTokenError,
        message: error.message,
      }),
    )
  }
}
