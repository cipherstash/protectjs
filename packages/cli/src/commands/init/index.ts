import * as p from '@clack/prompts'
import { implCommand } from '../impl/index.js'
import { createBaseProvider } from './providers/base.js'
import { createDrizzleProvider } from './providers/drizzle.js'
import { createSupabaseProvider } from './providers/supabase.js'
import { authenticateStep } from './steps/authenticate.js'
import { buildSchemaStep } from './steps/build-schema.js'
import { gatherContextStep } from './steps/gather-context.js'
import { installDepsStep } from './steps/install-deps.js'
import { installEqlStep } from './steps/install-eql.js'
import { resolveDatabaseStep } from './steps/resolve-database.js'
import type { InitProvider, InitState } from './types.js'
import { CancelledError } from './types.js'
import { detectPackageManager, runnerCommand } from './utils.js'

const PROVIDER_MAP: Record<string, () => InitProvider> = {
  supabase: createSupabaseProvider,
  drizzle: createDrizzleProvider,
}

/**
 * `stash init` does scaffold-once work only: auth, database connection,
 * schema introspection, dep install, EQL install, context gathering. It
 * exits at a clean checkpoint. The agent handoff (plan-or-implement) is
 * the responsibility of `stash impl`, which reads `.cipherstash/context.json`
 * and dispatches to the right handoff target.
 *
 * Splitting these gives the user a save-point between bootstrap and
 * implementation — they can review what init produced before committing
 * to the longer agent-driven phase.
 */
const STEPS = [
  authenticateStep,
  resolveDatabaseStep,
  buildSchemaStep,
  installDepsStep,
  installEqlStep,
  gatherContextStep,
]

function resolveProvider(flags: Record<string, boolean>): InitProvider {
  // When multiple flags are set, use the first matching provider but
  // combine all flag names into the provider name for referrer tracking.
  const matchedKeys = Object.keys(PROVIDER_MAP).filter((key) => flags[key])

  if (matchedKeys.length === 0) {
    return createBaseProvider()
  }

  // Use the first matched provider for UX (intro message, connection options, etc.)
  // matchedKeys[0] is guaranteed by the length check above; the optional chain
  // is just to satisfy biome's no-non-null-assertion rule.
  const factory = PROVIDER_MAP[matchedKeys[0]]
  const provider = factory ? factory() : createBaseProvider()

  // Combine all matched flag names for the referrer
  if (matchedKeys.length > 1) {
    provider.name = matchedKeys.sort().join('-')
  }

  return provider
}

export async function initCommand(flags: Record<string, boolean>) {
  const provider = resolveProvider(flags)

  p.intro('CipherStash Stack Setup')
  p.log.info(provider.introMessage)

  let state: InitState = {}

  try {
    for (const step of STEPS) {
      state = await step.run(state, provider)
    }

    const pm = detectPackageManager()
    const cli = runnerCommand(pm, 'stash')
    const checkmarks: string[] = [
      '✓ Authenticated to CipherStash',
      '✓ Database connection verified',
      '✓ Encryption client scaffolded',
    ]
    if (state.stackInstalled) {
      checkmarks.push('✓ `@cipherstash/stack` installed')
    }
    if (state.cliInstalled) checkmarks.push('✓ `stash` CLI installed')
    if (state.eqlInstalled) checkmarks.push('✓ EQL extension installed')

    p.note(checkmarks.join('\n'), 'Setup complete')

    // Offer to chain straight into `stash impl` so first-time users don't
    // have to copy/paste the next command. Default-yes for low friction;
    // answering N (or running non-interactively) preserves the explicit
    // two-command flow. Only prompts in plan mode by definition — at this
    // point the user has no plan yet, so impl will draft one (~1–3 min)
    // rather than dropping them into the hour-long implementation phase.
    if (process.stdout.isTTY) {
      const proceed = await p.confirm({
        message: `Continue to \`${cli} impl\` now to draft your encryption plan?`,
        initialValue: true,
      })
      if (!p.isCancel(proceed) && proceed) {
        p.outro('Setup complete — handing off to `stash impl`.')
        await implCommand({})
        return
      }
    }

    p.outro(`Next: run \`${cli} impl\` to draft your encryption plan.`)
  } catch (err) {
    if (err instanceof CancelledError) {
      p.cancel('Setup cancelled.')
      process.exit(0)
    }
    throw err
  }
}
