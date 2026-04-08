import * as p from '@clack/prompts'
import auth from '@cipherstash/auth'
import { bindDevice, login, regions, selectRegion } from '../../auth/login.js'
import type { InitProvider, InitState, InitStep } from '../types.js'

const { AutoStrategy } = auth

interface ExistingAuth {
  workspace: string
  regionLabel: string
}

/**
 * Check if the user is already authenticated with a valid token.
 * Uses OAuthStrategy.getToken() which handles refresh automatically.
 */
async function checkExistingAuth(): Promise<ExistingAuth | undefined> {
  try {
    const strategy = AutoStrategy.detect()
    const result = await strategy.getToken()

    const regionEntry = regions.find((r) => result.issuer.includes(r.value))
    const regionLabel = regionEntry?.label ?? 'unknown'

    return { workspace: result.workspaceId, regionLabel }
  } catch {
    return undefined
  }
}

export const authenticateStep: InitStep = {
  id: 'authenticate',
  name: 'Authenticate with CipherStash',
  async run(state: InitState, _provider: InitProvider): Promise<InitState> {
    const existing = await checkExistingAuth()

    if (existing) {
      const continueExisting = await p.confirm({
        message: `You're logged in to workspace ${existing.workspace} (${existing.regionLabel}). Continue with this workspace?`,
        initialValue: true,
      })

      if (p.isCancel(continueExisting)) {
        p.cancel('Cancelled.')
        process.exit(0)
      }

      if (continueExisting) {
        p.log.success(`Using workspace ${existing.workspace}`)
        return { ...state, authenticated: true }
      }

      // User wants a different workspace — fall through to login
      p.log.info('Logging in with a different workspace...')
    }

    const region = await selectRegion()
    await login(region, _provider.name)
    await bindDevice()
    return { ...state, authenticated: true }
  },
}
