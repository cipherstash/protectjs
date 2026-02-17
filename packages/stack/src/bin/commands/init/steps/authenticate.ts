import * as p from '@clack/prompts'
import type { InitStep, InitState, InitProvider } from '../types.js'
import { startDeviceCodeAuth, pollForToken } from '../stubs.js'
import { CancelledError } from '../types.js'

export const authenticateStep: InitStep = {
  id: 'authenticate',
  name: 'Authenticate',
  async run(state: InitState, _provider: InitProvider): Promise<InitState> {
    const s = p.spinner()

    s.start('Starting authentication...')
    const { verificationUrl, userCode, deviceCode } = await startDeviceCodeAuth()
    s.stop('Authentication started')

    p.note(
      `Open:  ${verificationUrl}\nCode:  ${userCode}`,
      'Authenticate with CipherStash',
    )

    s.start('Waiting for authentication...')
    const token = await pollForToken(deviceCode)
    s.stop('Authenticated successfully')

    return { ...state, accessToken: token.accessToken }
  },
}
