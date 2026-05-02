import { resolveDatabaseUrl } from '../../../config/database-url.js'
import type { InitProvider, InitState, InitStep } from '../types.js'

/**
 * Resolve the project's `DATABASE_URL` and stash it on init state.
 *
 * Delegates to `resolveDatabaseUrl()` (the same resolver `stash.config.ts`
 * uses), which walks: `--database-url` flag → `process.env.DATABASE_URL` →
 * `supabase status` → interactive prompt → hard fail. We pass `supabase: true`
 * when the project clearly is one so the resolver tries the Supabase CLI
 * even if the user hasn't passed `--supabase`.
 *
 * The resolver `process.exit(1)`s on failure with an actionable message, so
 * this step either produces a valid URL or stops the program cleanly. Every
 * downstream init step that needs DB access (build-schema introspection,
 * install-eql) reads `state.databaseUrl` rather than calling the resolver
 * again — one prompt, one failure mode.
 */
export const resolveDatabaseStep: InitStep = {
  id: 'resolve-database',
  name: 'Resolve database URL',
  async run(state: InitState, _provider: InitProvider): Promise<InitState> {
    // The provider name carries the integration flag the user passed at the
    // CLI (`--supabase` → 'supabase'), which lets the resolver try
    // `supabase status` even before we've inspected the project layout.
    const supabaseHint = _provider.name === 'supabase'
    const databaseUrl = await resolveDatabaseUrl({ supabase: supabaseHint })
    return { ...state, databaseUrl }
  },
}
