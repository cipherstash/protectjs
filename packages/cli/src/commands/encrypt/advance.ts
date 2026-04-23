import { loadStashConfig } from '@/config/index.js'
import { type MigrationPhase, appendEvent } from '@cipherstash/migrate'
import * as p from '@clack/prompts'
import pg from 'pg'

const PHASE_TO_EVENT: Record<
  MigrationPhase,
  | 'schema_added'
  | 'dual_writing'
  | 'backfill_started'
  | 'backfilled'
  | 'cut_over'
  | 'dropped'
> = {
  'schema-added': 'schema_added',
  'dual-writing': 'dual_writing',
  backfilling: 'backfill_started',
  backfilled: 'backfilled',
  'cut-over': 'cut_over',
  dropped: 'dropped',
}

export interface AdvanceCommandOptions {
  table: string
  column: string
  to: MigrationPhase
  note?: string
}

export async function advanceCommand(options: AdvanceCommandOptions) {
  p.intro('npx @cipherstash/cli encrypt advance')

  const config = await loadStashConfig()
  const client = new pg.Client({ connectionString: config.databaseUrl })

  try {
    await client.connect()
    await appendEvent(client, {
      tableName: options.table,
      columnName: options.column,
      event: PHASE_TO_EVENT[options.to],
      phase: options.to,
      details: options.note ? { note: options.note } : null,
    })

    p.log.success(
      `${options.table}.${options.column} is now recorded as '${options.to}'.`,
    )

    if (options.to === 'dual-writing') {
      p.note(
        `Update your persistence layer to write this value to both columns:\n  - ${options.column} (plaintext, existing)\n  - ${options.column}_encrypted (ciphertext, via your encryption client)\n\nThen run: stash encrypt backfill --table ${options.table} --column ${options.column}`,
        'Next',
      )
    }

    p.outro('Recorded.')
  } catch (error) {
    p.log.error(
      error instanceof Error ? error.message : 'Failed to record transition.',
    )
    process.exit(1)
  } finally {
    await client.end()
  }
}
