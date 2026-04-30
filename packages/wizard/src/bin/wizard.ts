import { config } from 'dotenv'

// Load env files in Next.js precedence order. dotenv's default behavior is to
// not overwrite vars that are already set, so loading .env.local first means
// its values win over .env for the same keys. Users can still set anything in
// the real environment to override both.
config({ path: '.env.local' })
config({ path: '.env.development.local' })
config({ path: '.env.development' })
config({ path: '.env' })

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as p from '@clack/prompts'
import { run } from '../run.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(
  readFileSync(join(__dirname, '../../package.json'), 'utf-8'),
)

const HELP = `
CipherStash Wizard v${pkg.version}

Usage: npx @cipherstash/wizard [options]

The wizard reads your codebase and wires up @cipherstash/stack encryption
for the columns you select. Run it once per project, after \`stash init\`.

Options:
  --help, -h           Show help
  --version, -v        Show version
  --debug              Print extra diagnostics from the agent
`.trim()

interface ParsedArgs {
  help: boolean
  version: boolean
  debug: boolean
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2)
  const flags = new Set(args)
  return {
    help: flags.has('--help') || flags.has('-h'),
    version: flags.has('--version') || flags.has('-v'),
    debug: flags.has('--debug'),
  }
}

async function main() {
  const { help, version, debug } = parseArgs(process.argv)

  if (help) {
    console.log(HELP)
    return
  }

  if (version) {
    console.log(pkg.version)
    return
  }

  await run({
    cwd: process.cwd(),
    debug,
    cliVersion: pkg.version,
  })
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  p.log.error(`Fatal error: ${message}`)
  process.exit(1)
})
