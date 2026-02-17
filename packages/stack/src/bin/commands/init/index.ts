import * as p from '@clack/prompts'
import type { InitProvider, InitState } from './types.js'
import { CancelledError } from './types.js'
import { authenticateStep } from './steps/authenticate.js'
import { selectWorkspaceStep } from './steps/select-workspace.js'
import { selectRegionStep } from './steps/select-region.js'
import { selectConnectionStep } from './steps/select-connection.js'
import { detectDatabaseUrlStep } from './steps/detect-database-url.js'
import { installEqlStep } from './steps/install-eql.js'
import { nextStepsStep } from './steps/next-steps.js'
import { createSupabaseProvider } from './providers/supabase.js'
import { createBaseProvider } from './providers/base.js'

const PROVIDER_MAP: Record<string, () => InitProvider> = {
  supabase: createSupabaseProvider,
}

const STEPS = [
  authenticateStep,
  selectWorkspaceStep,
  selectRegionStep,
  selectConnectionStep,
  detectDatabaseUrlStep,
  installEqlStep,
  nextStepsStep,
]

function resolveProvider(flags: Record<string, boolean>): InitProvider {
  for (const [key, factory] of Object.entries(PROVIDER_MAP)) {
    if (flags[key]) {
      return factory()
    }
  }
  return createBaseProvider()
}

export async function initCommand(flags: Record<string, boolean>) {
  const provider = resolveProvider(flags)

  p.intro(`CipherStash Stack Setup`)
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
