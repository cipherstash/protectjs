import { execSync } from 'node:child_process'
import * as p from '@clack/prompts'
import type { InitProvider, InitState, InitStep } from '../types.js'
import { CancelledError } from '../types.js'
import {
  combinedInstallCommands,
  detectPackageManager,
  isPackageInstalled,
} from '../utils.js'

const STACK_PACKAGE = '@cipherstash/stack'
const FORGE_PACKAGE = 'stash'

export const installForgeStep: InitStep = {
  id: 'install-forge',
  name: 'Install stack dependencies',
  async run(state: InitState, _provider: InitProvider): Promise<InitState> {
    const stackPresent = isPackageInstalled(STACK_PACKAGE)
    const forgePresent = isPackageInstalled(FORGE_PACKAGE)

    // Both already there — silent success, no prompts.
    if (stackPresent && forgePresent) {
      p.log.success(
        `${STACK_PACKAGE} and ${FORGE_PACKAGE} are already installed.`,
      )
      return { ...state, stackInstalled: true, forgeInstalled: true }
    }

    const pm = detectPackageManager()
    const prodPackages = stackPresent ? [] : [STACK_PACKAGE]
    const devPackages = forgePresent ? [] : [FORGE_PACKAGE]
    const commands = combinedInstallCommands(pm, prodPackages, devPackages)

    const missingList = [
      ...prodPackages.map((pkg) => `${pkg} (prod)`),
      ...devPackages.map((pkg) => `${pkg} (dev)`),
    ].join(', ')

    const install = await p.confirm({
      message: `Install ${missingList}? (${commands.join(' && ')})`,
    })

    if (p.isCancel(install)) throw new CancelledError()

    if (!install) {
      p.log.info('Skipping package installation.')
      p.note(
        `You can install them manually later:\n  ${commands.join('\n  ')}`,
        'Manual Installation',
      )
      return {
        ...state,
        stackInstalled: stackPresent,
        forgeInstalled: forgePresent,
      }
    }

    // Stream npm/pnpm/yarn output directly so the user sees progress.
    // Package installs can take tens of seconds and a silent spinner makes
    // the CLI look hung. We log a "starting" line here and a success line
    // after, letting the package manager own the terminal in between.
    let allSucceeded = true
    for (const cmd of commands) {
      p.log.step(`Running: ${cmd}`)
      try {
        execSync(cmd, { cwd: process.cwd(), stdio: 'inherit' })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        p.log.error(`Install failed: ${cmd}`)
        p.log.error(message)
        allSucceeded = false
      }
    }

    if (allSucceeded) {
      p.log.success('Stack dependencies installed.')
    } else {
      p.note(
        `You can retry manually:\n  ${commands.join('\n  ')}`,
        'Manual Installation',
      )
    }

    return {
      ...state,
      stackInstalled: stackPresent || allSucceeded,
      forgeInstalled: forgePresent || allSucceeded,
    }
  },
}
