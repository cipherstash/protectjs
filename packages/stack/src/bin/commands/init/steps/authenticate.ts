import { bindDevice, login } from '../../auth/login.js'
import type { InitProvider, InitState, InitStep } from '../types.js'

export const authenticateStep: InitStep = {
  id: 'authenticate',
  name: 'Authenticate with CipherStash',
  async run(state: InitState, _provider: InitProvider): Promise<InitState> {
    await login()
    await bindDevice()
    return { ...state, authenticated: true }
  },
}
