import { loadEncryptConfig, loadStashConfig } from '@/config/index.js'
import * as p from '@clack/prompts'
import pg from 'pg'

export async function pushCommand(options: { dryRun?: boolean }) {
  p.intro('stash-forge push')

  const s = p.spinner()

  s.start('Loading stash.config.ts...')
  const config = await loadStashConfig()
  s.stop('Configuration loaded.')

  s.start(`Loading encrypt client from ${config.client}...`)
  const encryptConfig = await loadEncryptConfig(config.client)
  s.stop('Encrypt client loaded and validated.')

  if (options.dryRun) {
    p.log.info('Dry run — no changes will be pushed.')
    p.note(JSON.stringify(encryptConfig, null, 2), 'Encryption Schema')
    p.outro('Dry run complete.')
    return
  }

  const client = new pg.Client({ connectionString: config.databaseUrl })

  try {
    s.start('Connecting to Postgres...')
    await client.connect()
    s.stop('Connected to Postgres.')

    s.start('Updating eql_v2_configuration...')
    await client.query(`
      UPDATE eql_v2_configuration SET state = 'inactive'
    `)

    await client.query(
      `
        INSERT INTO eql_v2_configuration (state, data) VALUES ('active', $1)
      `,
      [encryptConfig],
    )
    s.stop('Updated eql_v2_configuration.')

    p.outro('Push complete.')
  } catch (error) {
    s.stop('Failed.')
    p.log.error(
      error instanceof Error ? error.message : 'Failed to push configuration.',
    )
    process.exit(1)
  } finally {
    await client.end()
  }
}
