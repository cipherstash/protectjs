import { execSync } from 'node:child_process'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

type CliArgs = {
  migrationName: string
  drizzleDir: string
  showHelp: boolean
}

function parseArgs(argv: string[]): CliArgs {
  let migrationName = 'install-eql'
  let drizzleDir = 'drizzle'
  let showHelp = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      showHelp = true
    } else if (arg === '--name' || arg === '-n') {
      migrationName = argv[++i] ?? migrationName
    } else if (arg === '--out' || arg === '-o') {
      drizzleDir = argv[++i] ?? drizzleDir
    }
  }

  return { migrationName, drizzleDir, showHelp }
}

function printHelp(): void {
  console.log(`
Usage: generate-eql-migration [options]

Generate a Drizzle migration that installs CipherStash EQL

Options:
  -n, --name <name>    Migration name (default: "install-eql")
  -o, --out <dir>      Output directory (default: "drizzle")
  -h, --help           Display this help message

Examples:
  npx generate-eql-migration
  npx generate-eql-migration --name setup-eql
  npx generate-eql-migration --out migrations
  
  # Or with your package manager:
  pnpm generate-eql-migration
  yarn generate-eql-migration
  bun generate-eql-migration
`)
}

async function main(): Promise<void> {
  let migrationPath: string | null = null
  const args = parseArgs(process.argv.slice(2))

  if (args.showHelp) {
    printHelp()
    process.exit(0)
  }

  console.log('🔐 Generating EQL migration for Drizzle...\n')

  try {
    console.log(`📝 Generating custom migration: ${args.migrationName}`)
    execSync(`npx drizzle-kit generate --custom --name=${args.migrationName}`, {
      stdio: 'inherit',
    })
  } catch (error) {
    console.error('❌ Failed to generate custom migration')
    console.error('Make sure drizzle-kit is installed in your project.')
    process.exit(1)
  }

  try {
    const schemaPackagePath = resolve(__dirname, '../../schema')
    const sqlFileName = 'cipherstash-encrypt-2-1-8.sql'
    const sqlSourcePath = join(schemaPackagePath, sqlFileName)

    if (!existsSync(sqlSourcePath)) {
      throw new Error(`Could not find EQL SQL file at: ${sqlSourcePath}`)
    }

    const eqlSql = readFileSync(sqlSourcePath, 'utf-8')

    const drizzlePath = resolve(process.cwd(), args.drizzleDir)
    if (!existsSync(drizzlePath)) {
      throw new Error(
        `Drizzle directory not found: ${drizzlePath}\nMake sure to run this command from your project root.`,
      )
    }

    const files = await readdir(drizzlePath)
    const migrationFile = files
      .filter(
        (file) => file.endsWith('.sql') && file.includes(args.migrationName),
      )
      .sort()
      .pop()

    if (!migrationFile) {
      throw new Error(
        `Could not find migration file for: ${args.migrationName}\nLooked in: ${drizzlePath}`,
      )
    }

    migrationPath = join(drizzlePath, migrationFile)
    console.log(`\n📄 Writing EQL SQL to: ${migrationFile}`)

    writeFileSync(migrationPath, eqlSql, 'utf-8')

    console.log('\n✅ Successfully created EQL migration!')
    console.log('\nNext steps:')
    console.log(`  1. Review the migration: ${migrationPath}`)
    console.log('  2. Run migrations: npx drizzle-kit migrate')
    console.log(
      '     (or use your package manager: pnpm/yarn/bun drizzle-kit migrate)',
    )
  } catch (error) {
    if (migrationPath && existsSync(migrationPath)) {
      try {
        unlinkSync(migrationPath)
        console.error(`\n🗑️  Cleaned up migration file: ${migrationPath}`)
      } catch (cleanupError) {
        console.error(`\n⚠️  Failed to cleanup migration file: ${migrationPath}`)
      }
    }
    throw error
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error('❌ Error:', message)
  process.exit(1)
})
