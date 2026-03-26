import { bindDevice, login, selectRegion } from '../../auth/login.js'
import type { InitProvider, InitState, InitStep } from '../types.js'

export const authenticateStep: InitStep = {
  id: 'authenticate',
  name: 'Authenticate with CipherStash',
  async run(state: InitState, _provider: InitProvider): Promise<InitState> {
    const region = await selectRegion()
    await login(region)
    await bindDevice()
    return { ...state, authenticated: true }
  },
}
