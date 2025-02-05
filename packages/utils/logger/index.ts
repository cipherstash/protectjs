function getLevelValue(level: string): number {
  switch (level) {
    case 'debug':
      return 10
    case 'info':
      return 20
    case 'error':
      return 30
    default:
      return 30 // default to error level
  }
}

const envLogLevel = process.env.PROTECT_LOG_LEVEL || 'info'
const currentLevel = getLevelValue(envLogLevel)

function debug(...args: unknown[]): void {
  if (currentLevel <= getLevelValue('debug')) {
    console.debug('[jseql] DEBUG', ...args)
  }
}

function info(...args: unknown[]): void {
  if (currentLevel <= getLevelValue('info')) {
    console.info('[jseql] INFO', ...args)
  }
}

function error(...args: unknown[]): void {
  if (currentLevel <= getLevelValue('error')) {
    console.error('[jseql] ERROR', ...args)
  }
}

export const logger = {
  debug,
  info,
  error,
}
