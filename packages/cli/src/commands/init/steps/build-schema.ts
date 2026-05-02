import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import * as p from '@clack/prompts'
import { detectDrizzle, detectSupabase } from '../../db/detect.js'
import type {
  Integration,
  InitProvider,
  InitState,
  InitStep,
} from '../types.js'
import { CancelledError } from '../types.js'
import { generatePlaceholderClient, PLACEHOLDER_SCHEMA } from '../utils.js'

const DEFAULT_CLIENT_PATH = './src/encryption/index.ts'

/**
 * Pick the placeholder template by reading the same signals `db install`
 * uses — Drizzle config / dependency for `drizzle`, Supabase host in
 * `DATABASE_URL` for `supabase`, otherwise raw Postgres. Silent: never
 * prompts the user.
 */
function detectIntegration(
  cwd: string,
  databaseUrl: string | undefined,
): Integration {
  if (detectDrizzle(cwd)) return 'drizzle'
  if (detectSupabase(databaseUrl)) return 'supabase'
  return 'postgresql'
}

export const buildSchemaStep: InitStep = {
  id: 'build-schema',
  name: 'Generate encryption client',
  async run(state: InitState, _provider: InitProvider): Promise<InitState> {
    const cwd = process.cwd()
    const integration = detectIntegration(cwd, process.env.DATABASE_URL)
    const clientFilePath = DEFAULT_CLIENT_PATH
    const resolvedPath = resolve(cwd, clientFilePath)

    // Existing-file branch is the only place we still prompt — silently
    // overwriting someone's encryption client is bad. Everywhere else we
    // pick sensible defaults and move on.
    if (existsSync(resolvedPath)) {
      const action = await p.select({
        message: `${clientFilePath} already exists. What would you like to do?`,
        options: [
          {
            value: 'keep',
            label: 'Keep existing file',
            hint: 'skip code generation',
          },
          { value: 'overwrite', label: 'Overwrite with new schema' },
        ],
      })

      if (p.isCancel(action)) throw new CancelledError()

      if (action === 'keep') {
        p.log.info('Keeping existing encryption client file.')
        return {
          ...state,
          clientFilePath,
          schemaGenerated: false,
          integration,
          schema: PLACEHOLDER_SCHEMA,
        }
      }
    }

    const fileContents = generatePlaceholderClient(integration)

    const dir = dirname(resolvedPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    writeFileSync(resolvedPath, fileContents, 'utf-8')
    p.log.success(
      `Encryption client written to ${clientFilePath} (${integration} template)`,
    )

    return {
      ...state,
      clientFilePath,
      schemaGenerated: true,
      integration,
      schema: PLACEHOLDER_SCHEMA,
    }
  },
}
