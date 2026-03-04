import { loadStashConfig } from '@/config/index.js'
import { EQLInstaller } from '@/installer/index.js'
import * as p from '@clack/prompts'

export async function installCommand(options: {
  force?: boolean
  dryRun?: boolean
  excludeOperatorFamily?: boolean
  supabase?: boolean
}) {
  p.intro('stash-forge install')

  const s = p.spinner()

  s.start('Loading stash.config.ts...')
  const config = await loadStashConfig()
  s.stop('Configuration loaded.')

  if (options.dryRun) {
    p.log.info('Dry run — no changes will be made.')
    p.note(
      'Would download EQL install script from GitHub\nWould execute the SQL against the database',
      'Dry Run',
    )
    p.outro('Dry run complete.')
    return
  }

  const installer = new EQLInstaller({
    databaseUrl: config.databaseUrl,
  })

  s.start('Checking database permissions...')
  const permissions = await installer.checkPermissions()

  if (!permissions.ok) {
    s.stop('Insufficient database permissions.')
    p.log.error('The connected database role is missing required permissions:')
    for (const missing of permissions.missing) {
      p.log.warn(`  - ${missing}`)
    }
    p.note(
      'EQL installation requires a role with CREATE SCHEMA,\nCREATE TYPE, and CREATE EXTENSION privileges.\n\nConnect with a superuser or admin role, or ask your\ndatabase administrator to grant the required permissions.',
      'Required Permissions',
    )
    p.outro('Installation aborted.')
    process.exit(1)
  }
  s.stop('Database permissions verified.')

  if (!options.force) {
    s.start('Checking if EQL is already installed...')
    const installed = await installer.isInstalled()
    s.stop(installed ? 'EQL is already installed.' : 'EQL is not installed.')

    if (installed) {
      p.log.info('Use --force to re-run the install script.')
      p.outro('Nothing to do.')
      return
    }
  }

  s.start('Installing EQL extensions...')
  await installer.install({
    excludeOperatorFamily: options.excludeOperatorFamily,
    supabase: options.supabase,
  })
  s.stop('EQL extensions installed.')

  if (options.supabase) {
    p.log.success('Supabase role permissions granted.')
  }

  p.outro('Done!')
}
