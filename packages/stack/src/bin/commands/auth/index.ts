import { bindDevice, login, selectRegion } from './login.js'

const HELP = `
Usage: stash auth <command>

Commands:
  login     Authenticate with CipherStash

Examples:
  stash auth login
`.trim()

export async function authCommand(args: string[]) {
  const subcommand = args[0]

  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    console.log(HELP)
    return
  }

  switch (subcommand) {
    case 'login': {
      const region = await selectRegion()
      await login(region)
      await bindDevice()
    }
      break
    default:
      console.error(`Unknown auth command: ${subcommand}\n`)
      console.log(HELP)
      process.exit(1)
  }
}
