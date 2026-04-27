import type { Check } from '../../types.js'

export const authAuthenticated: Check = {
  id: 'auth.authenticated',
  title: 'Authenticated with CipherStash',
  category: 'auth',
  severity: 'error',
  async run({ cache }) {
    const result = await cache.token()
    if (result.ok && result.token) {
      return {
        status: 'pass',
        message: `workspace ${result.token.workspaceId}`,
        details: {
          workspaceId: result.token.workspaceId,
          subject: result.token.subject,
        },
      }
    }
    const code = result.code
    const isNotLoggedIn =
      code === 'NOT_AUTHENTICATED' || code === 'MISSING_WORKSPACE_CRN'
    return {
      status: 'fail',
      message: isNotLoggedIn
        ? 'Not authenticated'
        : `Failed to resolve CipherStash credentials${code ? ` (${code})` : ''}`,
      fixHint: 'Run: stash auth login',
      details: code ? { code } : undefined,
      cause: result.cause,
    }
  },
}
