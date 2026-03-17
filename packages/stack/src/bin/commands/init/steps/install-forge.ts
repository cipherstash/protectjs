import { execSync } from 'node:child_process'
import * as p from '@clack/prompts'
import type { InitProvider, InitState, InitStep } from '../types.js'
import { CancelledError } from '../types.js'
import {
  detectPackageManager,
  devInstallCommand,
  isPackageInstalled,
  prodInstallCommand,
} from '../utils.js'

const STACK_PACKAGE = '@cipherstash/stack'
const FORGE_PACKAGE = '@cipherstash/stack-forge'

/**
 * Installs a package if not already present.
 * Returns true if installed (or already was), false if skipped or failed.
 */
async function installIfNeeded(
  packageName: string,
  buildCommand: (pm: ReturnType<typeof detectPackageManager>, pkg: string) => string,
  depLabel: string,
): Promise<boolean> {
  if (isPackageInstalled(packageName)) {
    p.log.success(`${packageName} is already installed.`)
    return true
  }

  const pm = detectPackageManager()
  const cmd = buildCommand(pm, packageName)

  const install = await p.confirm({
    message: `Install ${packageName} as a ${depLabel} dependency? (${cmd})`,
  })

  if (p.isCancel(install)) throw new CancelledError()

  if (!install) {
    p.log.info(`Skipping ${packageName} installation.`)
    p.note(
      `You can install it manually later:\n  ${cmd}`,
      'Manual Installation',
    )
    return false
  }

  const s = p.spinner()
  s.start(`Installing ${packageName}...`)

  try {
    execSync(cmd, { cwd: process.cwd(), stdio: 'pipe' })
    s.stop(`${packageName} installed successfully`)
    return true
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    s.stop(`${packageName} installation failed`)
    p.log.error(message)
    p.note(`You can install it manually:\n  ${cmd}`, 'Manual Installation')
    return false
  }
}

export const installForgeStep: InitStep = {
  id: 'install-forge',
  name: 'Install stack dependencies',
  async run(state: InitState, _provider: InitProvider): Promise<InitState> {
    // Install @cipherstash/stack as a production dependency
    const stackInstalled = await installIfNeeded(STACK_PACKAGE, prodInstallCommand, 'production')

    // Install @cipherstash/stack-forge as a dev dependency
    const forgeInstalled = await installIfNeeded(FORGE_PACKAGE, devInstallCommand, 'dev')

    return { ...state, forgeInstalled, stackInstalled }
  },
}
