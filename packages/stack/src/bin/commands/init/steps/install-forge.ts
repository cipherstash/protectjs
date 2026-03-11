import { execSync } from 'node:child_process'
import * as p from '@clack/prompts'
import type { InitProvider, InitState, InitStep } from '../types.js'
import { CancelledError } from '../types.js'
import {
  detectPackageManager,
  devInstallCommand,
  isPackageInstalled,
} from '../utils.js'

const FORGE_PACKAGE = '@cipherstash/stack-forge'

export const installForgeStep: InitStep = {
  id: 'install-forge',
  name: 'Install stack-forge',
  async run(state: InitState, _provider: InitProvider): Promise<InitState> {
    if (isPackageInstalled(FORGE_PACKAGE)) {
      p.log.success(`${FORGE_PACKAGE} is already installed.`)
      return { ...state, forgeInstalled: true }
    }

    const pm = detectPackageManager()
    const cmd = devInstallCommand(pm, FORGE_PACKAGE)

    const install = await p.confirm({
      message: `Install ${FORGE_PACKAGE} as a dev dependency? (${cmd})`,
    })

    if (p.isCancel(install)) throw new CancelledError()

    if (!install) {
      p.log.info(`Skipping ${FORGE_PACKAGE} installation.`)
      p.note(
        `You can install it manually later:\n  ${cmd}`,
        'Manual Installation',
      )
      return { ...state, forgeInstalled: false }
    }

    const s = p.spinner()
    s.start(`Installing ${FORGE_PACKAGE}...`)

    try {
      execSync(cmd, { cwd: process.cwd(), stdio: 'pipe' })
      s.stop(`${FORGE_PACKAGE} installed successfully`)
      return { ...state, forgeInstalled: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      s.stop(`${FORGE_PACKAGE} installation failed`)
      p.log.error(message)
      p.note(`You can install it manually:\n  ${cmd}`, 'Manual Installation')
      return { ...state, forgeInstalled: false }
    }
  },
}
