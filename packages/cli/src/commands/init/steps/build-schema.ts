import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import * as p from '@clack/prompts'
import { detectDrizzle, detectSupabase } from '../../db/detect.js'
import { buildSchemasFromDatabase } from '../lib/introspect.js'
import { writeBaselineContextFile } from '../lib/write-context.js'
import type {
  InitProvider,
  InitState,
  InitStep,
  Integration,
  SchemaDef,
} from '../types.js'
import { CancelledError } from '../types.js'
import {
  PLACEHOLDER_SCHEMA,
  generateClientFromSchemas,
  generatePlaceholderClient,
} from '../utils.js'
import { readEnvKeyNames } from './gather-context.js'

const DEFAULT_CLIENT_PATH = './src/encryption/index.ts'

/**
 * Pick the integration template by reading the same signals `db install`
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
    const integration = detectIntegration(cwd, state.databaseUrl)
    const clientFilePath = DEFAULT_CLIENT_PATH
    const resolvedPath = resolve(cwd, clientFilePath)

    // Existing-file branch: silent overwrite is bad. Ask once.
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
          schemas: [PLACEHOLDER_SCHEMA],
          schemaFromIntrospection: false,
        }
      }
    }

    // Try real introspection first. Falls through to placeholder for an
    // empty database, a connection error, or user cancellation at any prompt.
    let introspected: SchemaDef[] | undefined
    if (state.databaseUrl) {
      introspected = await buildSchemasFromDatabase(state.databaseUrl)
    }

    let fileContents: string
    let recordedSchemas: SchemaDef[]
    let fromIntrospection: boolean

    if (introspected && introspected.length > 0) {
      fileContents = generateClientFromSchemas(integration, introspected)
      recordedSchemas = introspected
      fromIntrospection = true
    } else {
      p.log.info(
        'No tables found in the public schema — writing a placeholder client. The handoff prompt will note this so the agent reshapes it to your real schema.',
      )
      fileContents = generatePlaceholderClient(integration)
      recordedSchemas = [PLACEHOLDER_SCHEMA]
      fromIntrospection = false
    }

    const dir = dirname(resolvedPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    writeFileSync(resolvedPath, fileContents, 'utf-8')
    p.log.success(
      fromIntrospection
        ? `Encryption client written to ${clientFilePath} (${integration}, ${recordedSchemas.length} table${recordedSchemas.length !== 1 ? 's' : ''} from introspection)`
        : `Encryption client written to ${clientFilePath} (${integration} placeholder)`,
    )

    // Read env-key names once and put them on state. gather-context (later in
    // the pipeline) and the handoff steps all read from there rather than
    // re-scanning `.env*` files. Names only — never values.
    const envKeys = readEnvKeyNames(cwd)

    const nextState: InitState = {
      ...state,
      clientFilePath,
      schemaGenerated: true,
      integration,
      schemas: recordedSchemas,
      schemaFromIntrospection: fromIntrospection,
      envKeys,
    }

    // Write a baseline `.cipherstash/context.json` immediately so it tracks
    // the encryption client we just generated. Handoff steps refresh it later
    // with the gateway-served rulebook version, but this guarantees the file
    // is consistent with the client even if init aborts before the handoff
    // (e.g. install-eql failure, Ctrl+C). Without this, an agent reading a
    // stale context.json from a previous run would happily believe it.
    writeBaselineContextFile(nextState, cwd, envKeys)

    return nextState
  },
}
