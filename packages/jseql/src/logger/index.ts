function getLevelValue(level: string): number {
  switch (level) {
    case 'debug':
      return 10
    case 'info':
      return 20
    case 'error':
      return 30
    default:
      return 20 // default to 'info'
  }
}

const envLogLevel = process.env.JSEQL_LOG_LEVEL || 'info'
const currentLevel = getLevelValue(envLogLevel)

function debug(...args: unknown[]): void {
  if (currentLevel <= getLevelValue('debug')) {
    console.debug('[DEBUG]', ...args)
  }
}

function info(...args: unknown[]): void {
  if (currentLevel <= getLevelValue('info')) {
    console.info('[INFO]', ...args)
  }
}

function error(...args: unknown[]): void {
  if (currentLevel <= getLevelValue('error')) {
    console.error('[ERROR]', ...args)
  }
}

export const logger = {
  debug,
  info,
  error,
}
