import * as p from '@clack/prompts'
import type { InitStep, InitState, InitProvider } from '../types.js'
import { installEqlExtension } from '../stubs.js'
import { CancelledError } from '../types.js'

export const installEqlStep: InitStep = {
  id: 'install-eql',
  name: 'Install EQL extension',
  async run(state: InitState, _provider: InitProvider): Promise<InitState> {
    if (!state.databaseUrl) {
      p.log.warn('Skipping EQL extension installation (no database URL)')
      return { ...state, eqlInstalled: false }
    }

    const install = await p.confirm({
      message: 'Install the EQL encryption extension in your database?',
    })

    if (p.isCancel(install)) throw new CancelledError()

    if (!install) {
      p.log.info('Skipping EQL extension installation')
      p.note(
        'You can install it manually later:\n  CREATE EXTENSION IF NOT EXISTS eql_v2;\n\nOr re-run this command:\n  npx @cipherstash/stack init',
        'Manual Installation',
      )
      return { ...state, eqlInstalled: false }
    }

    const s = p.spinner()
    s.start('Installing EQL extension...')

    try {
      await installEqlExtension(state.databaseUrl)
      s.stop('EQL extension installed successfully')
      return { ...state, eqlInstalled: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      s.stop('EQL extension installation failed')
      p.log.error(message)
      p.note(
        'You can install it manually:\n  CREATE EXTENSION IF NOT EXISTS eql_v2;\n\nOr install via Database.dev:\n  https://database.dev/cipherstash/eql',
        'Manual Installation',
      )
      return { ...state, eqlInstalled: false }
    }
  },
}
