import { loadStashConfig } from '@/config/index.js'
import {
  appendEvent,
  progress,
  reloadConfig,
  renameEncryptedColumns,
} from '@cipherstash/migrate'
import * as p from '@clack/prompts'
import pg from 'pg'

export interface CutoverCommandOptions {
  table: string
  column: string
  proxyUrl?: string
}

export async function cutoverCommand(options: CutoverCommandOptions) {
  p.intro('npx @cipherstash/cli encrypt cutover')

  const config = await loadStashConfig()
  const client = new pg.Client({ connectionString: config.databaseUrl })

  try {
    await client.connect()

    const state = await progress(client, options.table, options.column)
    if (state?.phase !== 'backfilled') {
      p.log.error(
        `Cannot cut over: ${options.table}.${options.column} is in phase '${state?.phase ?? '—'}'. Must be 'backfilled'.`,
      )
      process.exit(1)
    }

    await client.query('BEGIN')
    try {
      await renameEncryptedColumns(client)
      await appendEvent(client, {
        tableName: options.table,
        columnName: options.column,
        event: 'cut_over',
        phase: 'cut-over',
        details: { renamed: true },
      })
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    }

    p.log.success(
      `Renamed ${options.column} → ${options.column}_plaintext and ${options.column}_encrypted → ${options.column}.`,
    )

    const proxyUrl = options.proxyUrl ?? process.env.CIPHERSTASH_PROXY_URL
    if (proxyUrl) {
      const proxy = new pg.Client({ connectionString: proxyUrl })
      try {
        await proxy.connect()
        await reloadConfig(proxy)
        p.log.success('Proxy config reloaded.')
      } finally {
        await proxy.end()
      }
    } else {
      p.log.warn(
        'CIPHERSTASH_PROXY_URL not set; Proxy users must wait up to 60s for config refresh.',
      )
    }

    p.outro(
      'Cut-over complete. Your app reads the encrypted column transparently.',
    )
  } catch (error) {
    p.log.error(error instanceof Error ? error.message : 'Cut-over failed.')
    process.exit(1)
  } finally {
    await client.end()
  }
}
