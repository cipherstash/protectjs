import * as p from '@clack/prompts'
import type { InitStep, InitState, InitProvider } from '../types.js'
import { CancelledError } from '../types.js'

export const selectConnectionStep: InitStep = {
  id: 'select-connection',
  name: 'Select connection method',
  async run(state: InitState, provider: InitProvider): Promise<InitState> {
    const method = await p.select({
      message: 'How will you connect to your database?',
      options: provider.connectionOptions,
    })

    if (p.isCancel(method)) throw new CancelledError()

    return { ...state, connectionMethod: method as string }
  },
}
