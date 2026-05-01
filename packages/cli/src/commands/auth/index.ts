import { messages } from '../../messages.js'
import { bindDevice, login, selectRegion } from './login.js'

const HELP = `
${messages.auth.usagePrefix} <command> [options]

Commands:
  login     Authenticate with CipherStash

Options:
  --supabase    Track Supabase as the referrer
  --drizzle     Track Drizzle as the referrer

Examples:
  npx stash auth login
  npx stash auth login --supabase
`.trim()

function referrerFromFlags(flags: Record<string, boolean>): string | undefined {
  const parts: string[] = []
  if (flags.drizzle) parts.push('drizzle')
  if (flags.supabase) parts.push('supabase')
  return parts.length > 0 ? parts.join('-') : undefined
}

export async function authCommand(
  args: string[],
  flags: Record<string, boolean>,
) {
  const subcommand = args[0]

  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    console.log(HELP)
    return
  }

  const referrer = referrerFromFlags(flags)

  switch (subcommand) {
    case 'login':
      {
        const region = await selectRegion()
        await login(region, referrer)
        await bindDevice()
      }
      break
    default:
      console.error(`${messages.auth.unknownSubcommand}: ${subcommand}\n`)
      console.log(HELP)
      process.exit(1)
  }
}
