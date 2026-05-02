import * as p from '@clack/prompts'
import { installCommand } from '../../db/install.js'
import type { InitProvider, InitState, InitStep } from '../types.js'
import { CancelledError } from '../types.js'

/**
 * Run `stash db install` programmatically after a y/N confirm.
 *
 * EQL is the Postgres extension every CipherStash query relies on. Without
 * it, the encryption client can't read or write to encrypted columns.
 * Skipping isn't a dead end — the action prompt fed to the agent will note
 * it as the first thing to run before any migration.
 *
 * We pass the URL we already resolved at the start of init (state.databaseUrl)
 * through to `installCommand` so the user is never re-prompted. The installer
 * picks the Supabase migration / direct mode itself based on `--supabase` and
 * project layout — we don't pre-decide it here.
 *
 * `installCommand` may `process.exit(1)` on a hard failure (mutually-exclusive
 * flag clash, scaffold cancellation). That's fine — by that point the user
 * has already authenticated and written the encryption client, and a clean
 * exit is preferable to a half-installed setup.
 */
export const installEqlStep: InitStep = {
  id: 'install-eql',
  name: 'Install EQL extension',
  async run(state: InitState, provider: InitProvider): Promise<InitState> {
    const integration = state.integration ?? 'postgresql'
    const supabase = integration === 'supabase' || provider.name === 'supabase'
    const drizzle = integration === 'drizzle' || provider.name === 'drizzle'

    const proceed = await p.confirm({
      message:
        'Install the EQL extension into your database now? (required for encryption)',
      initialValue: true,
    })

    if (p.isCancel(proceed)) throw new CancelledError()

    if (!proceed) {
      p.log.info('Skipping EQL installation.')
      p.note(
        'Run `stash db install` before applying any migration that references encrypted columns.',
        'EQL not installed',
      )
      return { ...state, eqlInstalled: false }
    }

    try {
      await installCommand({
        supabase: supabase || undefined,
        drizzle: drizzle || undefined,
        databaseUrl: state.databaseUrl,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      p.log.error(`EQL install failed: ${message}`)
      p.note('Re-run with: stash db install', 'You can retry manually')
      return { ...state, eqlInstalled: false }
    }

    return { ...state, eqlInstalled: true }
  },
}
