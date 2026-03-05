import { execSync } from 'node:child_process'
import { existsSync, unlinkSync, writeFileSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { loadStashConfig } from '@/config/index.js'
import { EQLInstaller } from '@/installer/index.js'
import * as p from '@clack/prompts'

const DEFAULT_MIGRATION_NAME = 'install-eql'
const DEFAULT_DRIZZLE_OUT = 'drizzle'

export async function installCommand(options: {
  force?: boolean
  dryRun?: boolean
  excludeOperatorFamily?: boolean
  supabase?: boolean
  drizzle?: boolean
  name?: string
  out?: string
}) {
  p.intro('stash-forge install')

  const s = p.spinner()

  s.start('Loading stash.config.ts...')
  const config = await loadStashConfig()
  s.stop('Configuration loaded.')

  if (options.drizzle) {
    await generateDrizzleMigration(s, {
      name: options.name,
      out: options.out,
      dryRun: options.dryRun,
    })
    return
  }

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

/**
 * Generate a Drizzle migration that installs CipherStash EQL.
 *
 * Uses `drizzle-kit generate --custom` to scaffold an empty migration,
 * downloads the EQL install SQL from GitHub, and writes it into the file.
 */
async function generateDrizzleMigration(
  s: ReturnType<typeof p.spinner>,
  options: { name?: string; out?: string; dryRun?: boolean },
) {
  const migrationName = options.name ?? DEFAULT_MIGRATION_NAME
  const outDir = resolve(options.out ?? DEFAULT_DRIZZLE_OUT)

  if (options.dryRun) {
    p.log.info('Dry run — no changes will be made.')
    p.note(
      `Would run: npx drizzle-kit generate --custom --name=${migrationName}\nWould download EQL install SQL from GitHub\nWould write SQL to migration file in ${outDir}`,
      'Dry Run',
    )
    p.outro('Dry run complete.')
    return
  }

  let generatedMigrationPath: string | undefined

  // Step 1: Generate a custom Drizzle migration
  s.start('Generating custom Drizzle migration...')

  try {
    execSync(`npx drizzle-kit generate --custom --name=${migrationName}`, {
      stdio: 'pipe',
      encoding: 'utf-8',
    })
    s.stop('Custom Drizzle migration generated.')
  } catch (error) {
    s.stop('Failed to generate migration.')
    const stderr =
      error !== null &&
      typeof error === 'object' &&
      'stderr' in error &&
      typeof error.stderr === 'string'
        ? error.stderr.trim()
        : undefined
    if (stderr) {
      p.log.error(stderr)
    } else {
      p.log.error(
        error instanceof Error ? error.message : 'Unknown error occurred.',
      )
    }
    p.log.info('Make sure drizzle-kit is installed: npm install -D drizzle-kit')
    p.outro('Migration aborted.')
    process.exit(1)
  }

  // Step 2: Find the generated migration file
  s.start('Locating generated migration file...')

  try {
    generatedMigrationPath = await findGeneratedMigration(outDir, migrationName)
    s.stop(`Found migration: ${generatedMigrationPath}`)
  } catch (error) {
    s.stop('Failed to locate migration file.')
    p.log.error(
      error instanceof Error ? error.message : String(error),
    )
    p.outro('Migration aborted.')
    process.exit(1)
  }

  // Step 3: Download the EQL SQL
  s.start('Downloading EQL install script...')

  let eqlSql: string

  try {
    eqlSql = await downloadEqlSql()
    s.stop('EQL install script downloaded.')
  } catch (error) {
    s.stop('Failed to download EQL install script.')
    p.log.error(
      error instanceof Error ? error.message : String(error),
    )
    cleanupMigrationFile(generatedMigrationPath)
    p.outro('Migration aborted.')
    process.exit(1)
  }

  // Step 4: Write the EQL SQL into the migration file
  s.start('Writing EQL SQL into migration file...')

  try {
    writeFileSync(generatedMigrationPath, eqlSql, 'utf-8')
    s.stop('EQL SQL written to migration file.')
  } catch (error) {
    s.stop('Failed to write migration file.')
    p.log.error(
      error instanceof Error ? error.message : String(error),
    )
    cleanupMigrationFile(generatedMigrationPath)
    p.outro('Migration aborted.')
    process.exit(1)
  }

  p.log.success(`Migration created: ${generatedMigrationPath}`)
  p.note(
    'Run your Drizzle migrations to install EQL:\n\n  npx drizzle-kit migrate',
    'Next Steps',
  )
  p.outro('Done!')
}

/**
 * Find the most recently generated migration file matching the given name.
 * Drizzle-kit generates flat SQL files like `0000_install-eql.sql`.
 */
async function findGeneratedMigration(
  outDir: string,
  migrationName: string,
): Promise<string> {
  if (!existsSync(outDir)) {
    throw new Error(
      `Drizzle output directory not found: ${outDir}\nMake sure drizzle-kit is configured correctly.`,
    )
  }

  const entries = await readdir(outDir)

  const matchingFiles = entries
    .filter(
      (entry) => entry.endsWith('.sql') && entry.includes(migrationName),
    )
    .sort()

  if (matchingFiles.length === 0) {
    throw new Error(
      `Could not find a migration matching "${migrationName}" in ${outDir}`,
    )
  }

  return join(outDir, matchingFiles[matchingFiles.length - 1])
}

/**
 * Download the EQL install SQL from GitHub releases.
 */
async function downloadEqlSql(): Promise<string> {
  const EQL_INSTALL_URL =
    'https://github.com/cipherstash/encrypt-query-language/releases/latest/download/cipherstash-encrypt.sql'

  let response: Response

  try {
    response = await fetch(EQL_INSTALL_URL)
  } catch (error) {
    throw new Error('Failed to download EQL install script from GitHub.', {
      cause: error,
    })
  }

  if (!response.ok) {
    throw new Error(
      `Failed to download EQL install script. HTTP ${response.status}: ${response.statusText}`,
    )
  }

  return response.text()
}

/**
 * Attempt to clean up a generated migration file on failure.
 */
function cleanupMigrationFile(filePath: string | undefined): void {
  if (!filePath) return

  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath)
      p.log.info(`Cleaned up migration file: ${filePath}`)
    }
  } catch {
    p.log.warn(`Could not clean up migration file: ${filePath}`)
  }
}
