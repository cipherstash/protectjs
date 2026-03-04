import { config } from 'dotenv'
config()

import * as p from '@clack/prompts'
import { installCommand } from '../commands/index.js'

const HELP = `
CipherStash Forge v0.1.0

Usage: stash-forge <command> [options]

Commands:
  install    Install EQL extensions into your database
  init       Initialize CipherStash Forge in your project
  push       Push encryption schema to database
  migrate    Run pending EQL migrations
  status     Show EQL installation status

Options:
  --help, -h       Show help
  --version, -v    Show version
  --force                    (install) Reinstall even if already installed
  --dry-run                  (install) Show what would happen without making changes
  --supabase                 (install) Use Supabase-compatible install and grant role permissions
  --exclude-operator-family  (install) Skip operator family creation (for non-superuser roles)
`.trim()

function parseArgs(argv: string[]) {
  const args = argv.slice(2)
  const command = args[0]
  const flags: Record<string, boolean> = {}

  for (const arg of args.slice(1)) {
    if (arg.startsWith('--')) {
      flags[arg.slice(2)] = true
    }
  }

  return { command, flags }
}

async function main() {
  const { command, flags } = parseArgs(process.argv)

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
      })
      break
    case 'init':
    case 'push':
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
