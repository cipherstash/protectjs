import type { Check } from '../../types.js'

function extractWorkspaceIdFromCrn(crn: string): string | undefined {
  const match = crn.match(/crn:[^:]+:([^:]+)$/)
  return match ? match[1] : undefined
}

export const authWorkspaceIdMatchesConfig: Check = {
  id: 'auth.workspace-id-matches-config',
  title: 'Auth workspace matches CS_WORKSPACE_CRN',
  category: 'auth',
  severity: 'warn',
  dependsOn: ['auth.authenticated'],
  async run({ cache }) {
    const crn = process.env.CS_WORKSPACE_CRN
    if (!crn) {
      return {
        status: 'pass',
        message: 'CS_WORKSPACE_CRN not set — skipping',
      }
    }
    const expected = extractWorkspaceIdFromCrn(crn)
    if (!expected) {
      return {
        status: 'fail',
        message: `CS_WORKSPACE_CRN is not a valid CRN: ${crn}`,
        fixHint: 'CRN format: crn:<region>:<workspaceId>',
        details: { crn },
      }
    }
    const token = (await cache.token()).token
    if (!token) return { status: 'skip' }

    if (token.workspaceId === expected) {
      return {
        status: 'pass',
        details: { workspaceId: token.workspaceId },
      }
    }
    return {
      status: 'fail',
      message: `Logged in to ${token.workspaceId} but CS_WORKSPACE_CRN targets ${expected}`,
      fixHint:
        'Re-run `stash auth login` for the correct workspace, or update CS_WORKSPACE_CRN.',
      details: {
        tokenWorkspaceId: token.workspaceId,
        configWorkspaceId: expected,
      },
    }
  },
}
