import { config } from 'dotenv'
config()

import * as p from '@clack/prompts'
import { installCommand, pushCommand } from '../commands/index.js'

const HELP = `
CipherStash Forge
Usage: stash-forge <command> [options]

Commands:
  install    Install EQL extensions into your database
  init       Initialize CipherStash Forge in your project
  push       Push encryption schema to database
  migrate    Run pending encrypt config migrations
  status     Show EQL installation status

Options:
  --help, -h       Show help
  --version, -v    Show version
  --force                    (install) Reinstall even if already installed
  --dry-run                  (install, push) Show what would happen without making changes
  --supabase                 (install) Use Supabase-compatible install and grant role permissions
  --drizzle                  (install) Generate a Drizzle migration instead of direct install
  --exclude-operator-family  (install) Skip operator family creation (for non-superuser roles)
`.trim()

interface ParsedArgs {
  command: string | undefined
  flags: Record<string, boolean>
  values: Record<string, string>
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2)
  const command = args[0]
  const flags: Record<string, boolean> = {}
  const values: Record<string, string> = {}

  const rest = args.slice(1)
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const nextArg = rest[i + 1]

      // If the next argument exists and is not a flag, treat it as a value
      if (nextArg !== undefined && !nextArg.startsWith('--')) {
        values[key] = nextArg
        i++ // Skip the value argument
      } else {
        flags[key] = true
      }
    }
  }

  return { command, flags, values }
}

async function main() {
  const { command, flags, values } = parseArgs(process.argv)

  if (!command || flags.help || command === '--help' || command === '-h') {
    console.log(HELP)
    return
  }

  if (flags.version || command === '--version' || command === '-v') {
    console.log('0.1.0')
    return
  }

  switch (command) {
    case 'install':
      await installCommand({
        force: flags.force,
        dryRun: flags['dry-run'],
        supabase: flags.supabase,
        excludeOperatorFamily: flags['exclude-operator-family'],
        drizzle: flags.drizzle,
        name: values.name,
        out: values.out,
      })
      break
    case 'push':
      await pushCommand({ dryRun: flags['dry-run'] })
      break
    case 'init':
    case 'migrate':
    case 'status':
      p.log.warn(`"stash-forge ${command}" is not yet implemented.`)
      break
    default:
      p.log.error(`Unknown command: ${command}`)
      console.log()
      console.log(HELP)
      process.exit(1)
  }
}

main().catch((error) => {
  p.log.error(
    error instanceof Error ? error.message : 'An unexpected error occurred',
  )
  process.exit(1)
})
