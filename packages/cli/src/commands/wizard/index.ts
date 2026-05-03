import { spawn } from 'node:child_process'
import * as p from '@clack/prompts'
import {
  detectPackageManager,
  isPackageInstalled,
  runnerCommand,
} from '../init/utils.js'

const WIZARD_PACKAGE = '@cipherstash/wizard'

/**
 * Resolve the runner invocation into argv-style tokens for `spawn`.
 *
 * `runnerCommand` returns strings like `'pnpm dlx @cipherstash/wizard'` or
 * `'npx @cipherstash/wizard'`. Splitting on whitespace is safe here because
 * every token is constructed from a closed enum (the package manager name
 * and the literal package). We avoid `shell: true` so we don't have to
 * worry about quoting user-passed flags downstream.
 */
function splitRunner(cmd: string): { bin: string; preArgs: string[] } {
  const tokens = cmd.split(/\s+/).filter(Boolean)
  const [bin, ...preArgs] = tokens
  if (!bin) {
    // Should be unreachable — runnerCommand always returns at least one token.
    throw new Error(`Empty runner command: "${cmd}"`)
  }
  return { bin, preArgs }
}

/**
 * Thin wrapper around `@cipherstash/wizard`.
 *
 * The wizard ships as its own package so the heavy agent SDK stays out of the
 * `stash` CLI bundle. This wrapper exists so users see one CLI surface
 * (`stash wizard`) instead of being told to remember a second tool name.
 *
 * On a cold cache (the wizard package isn't installed in the project) the
 * package manager will download it before running — that can take a few
 * seconds. We surface that explicitly so the user doesn't think the CLI is
 * hung. We don't show a spinner because the wizard itself uses clack and
 * needs an inherited TTY; intercepting child stdout would break the wizard's
 * own UI.
 */
export async function wizardCommand(passthroughArgs: string[]): Promise<void> {
  const pm = detectPackageManager()
  const runner = runnerCommand(pm, WIZARD_PACKAGE)
  const cached = isPackageInstalled(WIZARD_PACKAGE)

  if (cached) {
    p.log.info('Launching the CipherStash wizard...')
  } else {
    p.log.info(
      `Launching the CipherStash wizard... first run downloads ${WIZARD_PACKAGE} (~5s).`,
    )
  }

  const { bin, preArgs } = splitRunner(runner)
  const args = [...preArgs, ...passthroughArgs]

  const exitCode = await new Promise<number>((resolvePromise) => {
    const child = spawn(bin, args, { stdio: 'inherit', shell: false })
    child.on('close', (code) => resolvePromise(code ?? 0))
    child.on('error', (err) => {
      p.log.error(`Failed to launch wizard: ${err.message}`)
      resolvePromise(127)
    })
  })

  if (exitCode !== 0) {
    process.exit(exitCode)
  }
}

export { splitRunner }
