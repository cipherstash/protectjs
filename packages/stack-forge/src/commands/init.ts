import { existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as p from '@clack/prompts'
import { installCommand } from './install.js'

const CONFIG_FILENAME = 'stash.config.ts'

/**
 * Common locations where an encryption client file might live.
 * Checked in order of priority during auto-detection.
 */
const COMMON_CLIENT_PATHS = [
  './src/encryption/index.ts',
  './src/encryption.ts',
  './encryption/index.ts',
  './encryption.ts',
  './src/lib/encryption/index.ts',
  './src/lib/encryption.ts',
] as const

export interface SetupOptions {
  force?: boolean
  dryRun?: boolean
  supabase?: boolean
  excludeOperatorFamily?: boolean
  drizzle?: boolean
  latest?: boolean
  name?: string
  out?: string
}

/**
 * Scans the project for an existing encryption client file at common locations.
 * Returns the first match, or `undefined` if none found.
 */
function detectClientPath(): string | undefined {
  const cwd = process.cwd()
  for (const candidate of COMMON_CLIENT_PATHS) {
    if (existsSync(resolve(cwd, candidate))) {
      return candidate
    }
  }
  return undefined
}

/**
 * Prompts the user to confirm a detected client path or enter one manually.
 * Returns the confirmed path, or `undefined` if the user cancels.
 */
async function resolveClientPath(): Promise<string | undefined> {
  const detected = detectClientPath()

  if (detected) {
    const useDetected = await p.confirm({
      message: `Found encryption client at ${detected}. Use this path?`,
      initialValue: true,
    })

    if (p.isCancel(useDetected)) return undefined
    if (useDetected) return detected
  }

  const clientPath = await p.text({
    message: 'Where is your encryption client file?',
    placeholder: './src/encryption/index.ts',
    defaultValue: './src/encryption/index.ts',
    initialValue: detected ?? './src/encryption/index.ts',
    validate(value) {
      if (!value || value.trim().length === 0) {
        return 'Client file path is required.'
      }
      if (!value.endsWith('.ts')) {
        return 'Client file path must end with .ts'
      }
    },
  })

  if (p.isCancel(clientPath)) return undefined
  return clientPath
}

function generateConfig(clientPath: string): string {
  return `import { defineConfig } from '@cipherstash/stack-forge'

export default defineConfig({
  databaseUrl: process.env.DATABASE_URL!,
  client: '${clientPath}',
})
`
}

export async function setupCommand(options: SetupOptions = {}) {
  p.intro('stash-forge setup')

  // 1. Check if stash.config.ts already exists
  const configPath = resolve(process.cwd(), CONFIG_FILENAME)
  if (existsSync(configPath) && !options.force) {
    p.log.warn(`${CONFIG_FILENAME} already exists. Skipping setup.`)
    p.log.info(
      `Use --force to overwrite, or delete ${CONFIG_FILENAME} and re-run "stash-forge setup".`,
    )
    p.outro('Nothing to do.')
    return
  }

  // 2. Auto-detect encryption client file path
  const clientPath = await resolveClientPath()
  if (!clientPath) {
    p.cancel('Setup cancelled.')
    process.exit(0)
  }

  // 3. Generate stash.config.ts
  const configContent = generateConfig(clientPath)
  writeFileSync(configPath, configContent, 'utf-8')
  p.log.success(`Created ${CONFIG_FILENAME}`)

  // 4. Install EQL extensions (only if DATABASE_URL is available)
  if (!process.env.DATABASE_URL) {
    p.note(
      'Set DATABASE_URL in your environment, then run:\n  npx stash-forge install',
      'DATABASE_URL not set',
    )
    p.outro('CipherStash Forge setup complete!')
    return
  }

  const shouldInstall = await p.confirm({
    message: 'Install EQL extensions in your database now?',
    initialValue: true,
  })

  if (p.isCancel(shouldInstall)) {
    p.cancel('Setup cancelled.')
    process.exit(0)
  }

  if (!shouldInstall) {
    p.note(
      'You can install EQL later:\n  npx stash-forge install',
      'Skipped Installation',
    )
    p.outro('CipherStash Forge setup complete!')
    return
  }

  // 6. Determine install flags from database provider
  const installOptions = await resolveInstallOptions(options)

  await installCommand({
    ...installOptions,
    drizzle: options.drizzle,
    latest: options.latest,
    name: options.name,
    out: options.out,
  })
}

type DatabaseProvider =
  | 'supabase'
  | 'neon'
  | 'vercel-postgres'
  | 'aws-rds'
  | 'planetscale'
  | 'prisma-postgres'
  | 'other'

/**
 * Resolves install flags based on the user's database provider.
 * Skips the prompt if `--supabase` was already passed as a CLI flag.
 */
async function resolveInstallOptions(
  options: SetupOptions,
): Promise<Pick<SetupOptions, 'force' | 'dryRun' | 'supabase' | 'excludeOperatorFamily'>> {
  // If --supabase was already passed, skip the prompt
  if (options.supabase) {
    return {
      force: options.force,
      dryRun: options.dryRun,
      supabase: true,
    }
  }

  const provider = await p.select<DatabaseProvider>({
    message: 'What Postgres database are you using?',
    options: [
      { value: 'supabase', label: 'Supabase' },
      { value: 'neon', label: 'Neon' },
      { value: 'vercel-postgres', label: 'Vercel Postgres' },
      { value: 'aws-rds', label: 'AWS RDS' },
      { value: 'planetscale', label: 'PlanetScale' },
      { value: 'prisma-postgres', label: 'Prisma Postgres' },
      { value: 'other', label: 'Other / Self-hosted' },
    ],
  })

  if (p.isCancel(provider)) {
    p.cancel('Setup cancelled.')
    process.exit(0)
  }

  switch (provider) {
    case 'supabase':
      return {
        force: options.force,
        dryRun: options.dryRun,
        supabase: true,
      }
    case 'neon':
    case 'vercel-postgres':
    case 'planetscale':
    case 'prisma-postgres':
      return {
        force: options.force,
        dryRun: options.dryRun,
        excludeOperatorFamily: true,
      }
    default:
      return {
        force: options.force,
        dryRun: options.dryRun,
      }
  }
}