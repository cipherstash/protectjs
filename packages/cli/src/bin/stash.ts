import { config } from 'dotenv'
config()

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as p from '@clack/prompts'
// Commands that depend on @cipherstash/stack are lazy-loaded in the switch below.
import {
  authCommand,
  initCommand,
  installCommand,
  setupCommand,
  statusCommand,
  testConnectionCommand,
  upgradeCommand,
} from '../commands/index.js'

function isModuleNotFound(err: unknown): boolean {
  return (
    err instanceof Error &&
    'code' in err &&
    (err as { code: string }).code === 'ERR_MODULE_NOT_FOUND'
  )
}

async function requireStack<T>(importFn: () => Promise<T>): Promise<T> {
  try {
    return await importFn()
  } catch (err: unknown) {
    if (isModuleNotFound(err)) {
      p.log.error(
        '@cipherstash/stack is required for this command.\n' +
        '  Install it with: npm install @cipherstash/stack\n' +
        '  Or run: npx @cipherstash/cli init',
      )
      process.exit(1) as never
    }
    throw err
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(
  readFileSync(join(__dirname, '../../package.json'), 'utf-8'),
)

const HELP = `
CipherStash CLI v${pkg.version}

Usage: npx @cipherstash/cli <command> [options]

Commands:
  init                 Initialize CipherStash for your project
  auth <subcommand>    Authenticate with CipherStash
  secrets <subcommand> Manage encrypted secrets
  wizard               AI-powered encryption setup (reads your codebase)

  db install           Install EQL extensions into your database
  db upgrade           Upgrade EQL extensions to the latest version
  db setup             Configure database and install EQL extensions
  db push              Push encryption schema to database (CipherStash Proxy only)
  db validate          Validate encryption schema
  db migrate           Run pending encrypt config migrations
  db status            Show EQL installation status
  db test-connection   Test database connectivity

  schema build         Build an encryption schema from your database

Options:
  --help, -h           Show help
  --version, -v        Show version

Init Flags:
  --supabase           Use Supabase-specific setup flow
  --drizzle            Use Drizzle-specific setup flow

DB Flags:
  --force                    (setup, install) Reinstall even if already installed
  --dry-run                  (setup, install, push, upgrade) Show what would happen without making changes
  --supabase                 (setup, install, upgrade, validate) Use Supabase-compatible mode
  --drizzle                  (setup, install) Generate a Drizzle migration instead of direct install
  --exclude-operator-family  (setup, install, upgrade, validate) Skip operator family creation
  --latest                   (setup, install, upgrade) Fetch the latest EQL from GitHub

Examples:
  npx @cipherstash/cli init
  npx @cipherstash/cli init --supabase
  npx @cipherstash/cli auth login
  npx @cipherstash/cli wizard
  npx @cipherstash/cli db setup
  npx @cipherstash/cli db push
  npx @cipherstash/cli schema build
  npx @cipherstash/cli secrets set -n DATABASE_URL -V "postgres://..." -e production
`.trim()

interface ParsedArgs {
  command: string | undefined
  subcommand: string | undefined
  commandArgs: string[]
  flags: Record<string, boolean>
  values: Record<string, string>
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2)
  const command = args[0]
  const subcommand = args[1] && !args[1].startsWith('-') ? args[1] : undefined
  const rest = args.slice(subcommand ? 2 : 1)

  const flags: Record<string, boolean> = {}
  const values: Record<string, string> = {}
  const commandArgs: string[] = []

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const nextArg = rest[i + 1]
      if (nextArg !== undefined && !nextArg.startsWith('-')) {
        values[key] = nextArg
        i++
      } else {
        flags[key] = true
      }
    } else {
      commandArgs.push(arg)
    }
  }

  return { command, subcommand, commandArgs, flags, values }
}

async function runDbCommand(
  sub: string | undefined,
  flags: Record<string, boolean>,
  values: Record<string, string>,
) {
  switch (sub) {
    case 'install':
      await installCommand({
        force: flags.force,
        dryRun: flags['dry-run'],
        supabase: flags.supabase,
        excludeOperatorFamily: flags['exclude-operator-family'],
        drizzle: flags.drizzle,
        latest: flags.latest,
        name: values.name,
        out: values.out,
      })
      break
    case 'upgrade':
      await upgradeCommand({
        dryRun: flags['dry-run'],
        supabase: flags.supabase,
        excludeOperatorFamily: flags['exclude-operator-family'],
        latest: flags.latest,
      })
      break
    case 'setup':
      await setupCommand({
        force: flags.force,
        dryRun: flags['dry-run'],
        supabase: flags.supabase,
        excludeOperatorFamily: flags['exclude-operator-family'],
        drizzle: flags.drizzle,
        latest: flags.latest,
        name: values.name,
        out: values.out,
      })
      break
    case 'push': {
      const { pushCommand } = await requireStack(() => import('../commands/db/push.js'))
      await pushCommand({ dryRun: flags['dry-run'] })
      break
    }
    case 'validate': {
      const { validateCommand } = await requireStack(() => import('../commands/db/validate.js'))
      await validateCommand({
        supabase: flags.supabase,
        excludeOperatorFamily: flags['exclude-operator-family'],
      })
      break
    }
    case 'status':
      await statusCommand()
      break
    case 'test-connection':
      await testConnectionCommand()
      break
    case 'migrate':
      p.log.warn('"npx @cipherstash/cli db migrate" is not yet implemented.')
      break
    default:
      p.log.error(`Unknown db subcommand: ${sub ?? '(none)'}`)
      console.log()
      console.log(HELP)
      process.exit(1)
  }
}

async function runSchemaCommand(
  sub: string | undefined,
  flags: Record<string, boolean>,
) {
  switch (sub) {
    case 'build': {
      const { builderCommand } = await requireStack(() => import('../commands/schema/build.js'))
      await builderCommand({ supabase: flags.supabase })
      break
    }
    default:
      p.log.error(`Unknown schema subcommand: ${sub ?? '(none)'}`)
      console.log()
      console.log(HELP)
      process.exit(1)
  }
}

async function main() {
  const { command, subcommand, commandArgs, flags, values } = parseArgs(
    process.argv,
  )

  if (!command || command === '--help' || command === '-h' || flags.help) {
    console.log(HELP)
    return
  }

  if (command === '--version' || command === '-v' || flags.version) {
    console.log(pkg.version)
    return
  }

  switch (command) {
    case 'init':
      await initCommand(flags)
      break
    case 'auth': {
      const authArgs = subcommand ? [subcommand, ...commandArgs] : commandArgs
      await authCommand(authArgs, flags)
      break
    }
    case 'secrets': {
      const { secretsCommand } = await requireStack(() => import('../commands/secrets/index.js'))
      const secretsArgs = subcommand
        ? [subcommand, ...commandArgs]
        : commandArgs
      await secretsCommand(secretsArgs)
      break
    }
    case 'wizard': {
      // Lazy-load the wizard so the agent SDK is only imported when needed.
      const { run } = await import('../commands/wizard/run.js')
      await run({
        cwd: process.cwd(),
        debug: flags.debug,
        cliVersion: pkg.version,
      })
      break
    }
    case 'db':
      await runDbCommand(subcommand, flags, values)
      break
    case 'schema':
      await runSchemaCommand(subcommand, flags)
      break
    default:
      console.error(`Unknown command: ${command}\n`)
      console.log(HELP)
      process.exit(1)
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  p.log.error(`Fatal error: ${message}`)
  process.exit(1)
})
