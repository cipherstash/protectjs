import * as p from '@clack/prompts'
import { createBaseProvider } from './providers/base.js'
import { createDrizzleProvider } from './providers/drizzle.js'
import { createSupabaseProvider } from './providers/supabase.js'
import { authenticateStep } from './steps/authenticate.js'
import { buildSchemaStep } from './steps/build-schema.js'
import { gatherContextStep } from './steps/gather-context.js'
import { howToProceedStep } from './steps/how-to-proceed.js'
import { installForgeStep } from './steps/install-forge.js'
import { nextStepsStep } from './steps/next-steps.js'
import type { InitProvider, InitState } from './types.js'
import { CancelledError } from './types.js'

const PROVIDER_MAP: Record<string, () => InitProvider> = {
  supabase: createSupabaseProvider,
  drizzle: createDrizzleProvider,
}

const STEPS = [
  authenticateStep,
  buildSchemaStep,
  installForgeStep,
  gatherContextStep,
  howToProceedStep,
  nextStepsStep,
]

function resolveProvider(flags: Record<string, boolean>): InitProvider {
  // When multiple flags are set, use the first matching provider but
  // combine all flag names into the provider name for referrer tracking.
  const matchedKeys = Object.keys(PROVIDER_MAP).filter((key) => flags[key])

  if (matchedKeys.length === 0) {
    return createBaseProvider()
  }

  // Use the first matched provider for UX (intro message, connection options, etc.)
  const provider = PROVIDER_MAP[matchedKeys[0]]!()

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
    p.outro('Setup complete!')
  } catch (err) {
    if (err instanceof CancelledError) {
      p.cancel('Setup cancelled.')
      process.exit(0)
    }
    throw err
  }
}
