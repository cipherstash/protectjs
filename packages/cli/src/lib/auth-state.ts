import auth from '@cipherstash/auth'

export interface CredentialsResult {
  ok: boolean
  /** `AuthError.code` if the failure was a recognised auth error. */
  code?: string
  /** Raw underlying error when the failure wasn't a known auth code. */
  cause?: unknown
}

/**
 * Probe whether the local environment has valid CipherStash credentials.
 *
 * Defers to `@cipherstash/auth`'s `AutoStrategy.detect().getToken()` — the
 * on-disk layout has shifted between auth versions and duplicating it in the
 * CLI is what caused CIP-2996. `getToken()` handles token refresh, so any
 * failure here genuinely means "not authenticated" or "transport broken".
 */
export async function probeCredentials(): Promise<CredentialsResult> {
  try {
    await auth.AutoStrategy.detect().getToken()
    return { ok: true }
  } catch (error) {
    const code = (error as { code?: string } | null)?.code
    if (code === 'NOT_AUTHENTICATED' || code === 'MISSING_WORKSPACE_CRN') {
      return { ok: false, code }
    }
    return { ok: false, code, cause: error }
  }
}

/**
 * Boolean credential probe. Returns `false` for the well-known "not logged in"
 * error codes and re-throws for anything else so unexpected failures (network,
 * disk, etc.) aren't silently swallowed.
 */
export async function hasCredentials(): Promise<boolean> {
  const result = await probeCredentials()
  if (result.ok) return true
  if (
    result.code === 'NOT_AUTHENTICATED' ||
    result.code === 'MISSING_WORKSPACE_CRN'
  ) {
    return false
  }
  throw result.cause ?? new Error('Failed to resolve CipherStash credentials')
}
