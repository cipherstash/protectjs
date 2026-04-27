import type { Check } from '../../types.js'

export const envCsWorkspaceCrn: Check = {
  id: 'env.cs-workspace-crn',
  title: 'CS_WORKSPACE_CRN is set',
  category: 'env',
  severity: 'info',
  async run() {
    if (process.env.CS_WORKSPACE_CRN) {
      return { status: 'pass' }
    }
    return {
      status: 'fail',
      message: 'CS_WORKSPACE_CRN is not set',
      fixHint:
        'Required in production / CI. For local dev the device-code auth in ~/.cipherstash/ supplies the workspace context — safe to ignore locally.',
    }
  },
}
