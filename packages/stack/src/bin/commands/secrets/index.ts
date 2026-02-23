import { style } from './helpers.js'
import { deleteSecret } from './delete.js'
import { getManySecrets } from './get-many.js'
import { getSecret } from './get.js'
import { listSecrets } from './list.js'
import { setSecret } from './set.js'

function parseFlags(args: string[]): Record<string, string | boolean> {
  const flags: Record<string, string | boolean> = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--yes' || arg === '-y') {
      flags.yes = true
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = args[i + 1]
      if (next && !next.startsWith('-')) {
        flags[key] = next
        i++
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      const alias: Record<string, string> = {
        n: 'name',
        V: 'value',
        e: 'environment',
      }
      const key = alias[arg[1]] || arg[1]
      const next = args[i + 1]
      if (next && !next.startsWith('-')) {
        flags[key] = next
        i++
      }
    }
  }
  return flags
}

function requireFlag(
  flags: Record<string, string | boolean>,
  name: string,
): string {
  const val = flags[name]
  if (!val || typeof val !== 'string') {
    console.error(style.error(`Missing required flag: --${name}`))
    process.exit(1)
  }
  return val
}

const HELP = `
${style.title('Usage:')} stash secrets <command> [options]

${style.title('Commands:')}
  set       Store an encrypted secret
  get       Retrieve and decrypt a secret
  get-many  Retrieve and decrypt multiple secrets (min 2, max 100)
  list      List all secrets in an environment
  delete    Delete a secret

${style.title('Options:')}
  -n, --name          Secret name (comma-separated for get-many)
  -V, --value         Secret value (set only)
  -e, --environment   Environment name
  -y, --yes           Skip confirmation (delete only)

${style.title('Examples:')}
  stash secrets set -n DATABASE_URL -V "postgres://..." -e production
  stash secrets get -n DATABASE_URL -e production
  stash secrets get-many -n DATABASE_URL,API_KEY -e production
  stash secrets list -e production
  stash secrets delete -n DATABASE_URL -e production -y
`.trim()

export async function secretsCommand(args: string[]) {
  const subcommand = args[0]
  const rest = args.slice(1)

  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    console.log(HELP)
    return
  }

  const flags = parseFlags(rest)

  switch (subcommand) {
    case 'set': {
      const name = requireFlag(flags, 'name')
      const value = requireFlag(flags, 'value')
      const environment = requireFlag(flags, 'environment')
      await setSecret({ name, value, environment })
      break
    }
    case 'get': {
      const name = requireFlag(flags, 'name')
      const environment = requireFlag(flags, 'environment')
      await getSecret({ name, environment })
      break
    }
    case 'get-many': {
      const namesStr = requireFlag(flags, 'name')
      const names = namesStr
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      if (names.length < 2) {
        console.error(
          style.error(
            'get-many requires at least 2 secret names (comma-separated)',
          ),
        )
        process.exit(1)
      }
      if (names.length > 100) {
        console.error(style.error('get-many supports maximum 100 secret names'))
        process.exit(1)
      }
      const environment = requireFlag(flags, 'environment')
      await getManySecrets({ names, environment })
      break
    }
    case 'list': {
      const environment = requireFlag(flags, 'environment')
      await listSecrets({ environment })
      break
    }
    case 'delete': {
      const name = requireFlag(flags, 'name')
      const environment = requireFlag(flags, 'environment')
      await deleteSecret({ name, environment, yes: flags.yes === true })
      break
    }
    default:
      console.error(style.error(`Unknown secrets command: ${subcommand}`))
      console.log(HELP)
      process.exit(1)
  }
}
