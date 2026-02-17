import { config } from 'dotenv'
config()

import { Secrets, type SecretsConfig } from '../../../secrets/index.js'

export const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
}

export const style = {
  success: (text: string) =>
    `${colors.green}${colors.bold}✓${colors.reset} ${colors.green}${text}${colors.reset}`,
  error: (text: string) =>
    `${colors.red}${colors.bold}✗${colors.reset} ${colors.red}${text}${colors.reset}`,
  info: (text: string) =>
    `${colors.blue}${colors.bold}ℹ${colors.reset} ${colors.blue}${text}${colors.reset}`,
  warning: (text: string) =>
    `${colors.yellow}${colors.bold}⚠${colors.reset} ${colors.yellow}${text}${colors.reset}`,
  title: (text: string) => `${colors.bold}${colors.cyan}${text}${colors.reset}`,
  label: (text: string) => `${colors.dim}${text}${colors.reset}`,
  value: (text: string) => `${colors.bold}${text}${colors.reset}`,
  bullet: () => `${colors.green}•${colors.reset}`,
}

export function getConfig(environment: string): SecretsConfig {
  const workspaceCRN = process.env.CS_WORKSPACE_CRN
  const clientId = process.env.CS_CLIENT_ID
  const clientKey = process.env.CS_CLIENT_KEY
  const apiKey = process.env.CS_CLIENT_ACCESS_KEY
  const accessKey = process.env.CS_ACCESS_KEY

  const missing: string[] = []
  if (!workspaceCRN) missing.push('CS_WORKSPACE_CRN')
  if (!clientId) missing.push('CS_CLIENT_ID')
  if (!clientKey) missing.push('CS_CLIENT_KEY')
  if (!apiKey) missing.push('CS_CLIENT_ACCESS_KEY')

  if (missing.length > 0) {
    console.error(
      style.error(
        `Missing required environment variables: ${missing.join(', ')}`,
      ),
    )
    console.error(
      `\n${style.info('Please set the following environment variables:')}`,
    )
    for (const varName of missing) {
      console.error(`  ${style.bullet()} ${varName}`)
    }
    process.exit(1)
  }

  if (!workspaceCRN || !clientId || !clientKey || !apiKey) {
    throw new Error('Missing required configuration')
  }

  return {
    workspaceCRN,
    clientId,
    clientKey,
    apiKey,
    accessKey,
    environment,
  }
}

export function createStash(environment: string): Secrets {
  const cfg = getConfig(environment)
  return new Secrets(cfg)
}
