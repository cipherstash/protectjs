import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import * as p from '@clack/prompts'
import { detectDrizzle, detectSupabase } from '../../db/detect.js'
import { buildSchemasFromDatabase } from '../lib/introspect.js'
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

/**
 * Generate the encryption client from a real DB introspection. Returns
 * `undefined` when introspection fails, the DB has no tables, or the user
 * cancels — callers fall back to the placeholder.
 *
 * Uses the URL already resolved by `resolve-database` (threaded through
 * state) rather than calling the resolver again.
 */
async function buildFromIntrospection(
  databaseUrl: string,
): Promise<SchemaDef[] | undefined> {
  return buildSchemasFromDatabase(databaseUrl)
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
          schema: PLACEHOLDER_SCHEMA,
          schemaFromIntrospection: false,
        }
      }
    }

    // Try real introspection first. Falls through to placeholder for an
    // empty database, a connection error, or user cancellation at any prompt.
    let schemas: SchemaDef[] | undefined
    if (state.databaseUrl) {
      schemas = await buildFromIntrospection(state.databaseUrl)
    }

    let fileContents: string
    let recordedSchema: SchemaDef
    let fromIntrospection: boolean

    if (schemas && schemas.length > 0 && schemas[0]) {
      fileContents = generateClientFromSchemas(integration, schemas)
      // We record the first schema for context.json so handoffs have a
      // canonical "what got encrypted" pointer. Multi-table users can read
      // the full set from the generated client file.
      recordedSchema = schemas[0]
      fromIntrospection = true
    } else {
      p.log.info(
        'No tables found in the public schema — writing a placeholder client. The handoff prompt will note this so the agent reshapes it to your real schema.',
      )
      fileContents = generatePlaceholderClient(integration)
      recordedSchema = PLACEHOLDER_SCHEMA
      fromIntrospection = false
    }

    const dir = dirname(resolvedPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    writeFileSync(resolvedPath, fileContents, 'utf-8')
    p.log.success(
      fromIntrospection
        ? `Encryption client written to ${clientFilePath} (${integration}, ${schemas?.length ?? 0} table${(schemas?.length ?? 0) !== 1 ? 's' : ''} from introspection)`
        : `Encryption client written to ${clientFilePath} (${integration} placeholder)`,
    )

    return {
      ...state,
      clientFilePath,
      schemaGenerated: true,
      integration,
      schema: recordedSchema,
      schemaFromIntrospection: fromIntrospection,
    }
  },
}
