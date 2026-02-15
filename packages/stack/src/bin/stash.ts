import { config } from 'dotenv'
config()

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { initCommand } from './commands/init/index.js'
import { secretsCommand } from './commands/secrets/index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(
  readFileSync(join(__dirname, '../../package.json'), 'utf-8'),
)

const HELP = `
CipherStash Stack CLI v${pkg.version}

Usage: stash <command> [options]

Commands:
  init       Initialize CipherStash for your project
  secrets    Manage encrypted secrets

Options:
  --help, -h       Show help
  --version, -v    Show version

Init Flags:
  --supabase       Use Supabase-specific setup flow

Examples:
  stash init
  stash init --supabase
  stash secrets set -n DATABASE_URL -V "postgres://..." -e production
  stash secrets get -n DATABASE_URL -e production
  stash secrets list -e production
`.trim()

function parseArgs(argv: string[]) {
  const args = argv.slice(2)
  const command = args[0]
  const rest = args.slice(1)

  const booleanFlags: Record<string, boolean> = {}
  const commandArgs: string[] = []

  for (const arg of rest) {
    if (arg.startsWith('--') && !arg.includes('=')) {
      booleanFlags[arg.slice(2)] = true
    } else {
      commandArgs.push(arg)
    }
  }

  return { command, rest, booleanFlags, commandArgs }
}

async function main() {
  const { command, rest, booleanFlags } = parseArgs(process.argv)

  if (!command || command === '--help' || command === '-h') {
    console.log(HELP)
    return
  }

  if (command === '--version' || command === '-v') {
    console.log(pkg.version)
    return
  }

  switch (command) {
    case 'init':
      await initCommand(booleanFlags)
      break
    case 'secrets':
      await secretsCommand(rest)
      break
    default:
      console.error(`Unknown command: ${command}\n`)
      console.log(HELP)
      process.exit(1)
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  console.error(`Fatal error: ${message}`)
  process.exit(1)
})
