function getLevelValue(level: string): number {
  switch (level) {
    case 'debug':
      return 10
    case 'info':
      return 20
    case 'warn':
      return 25
    case 'error':
      return 30
    default:
      return 30 // default to error level
  }
}

const envLogLevel = process.env.STASH_LOG_LEVEL || 'info'
const currentLevel = getLevelValue(envLogLevel)

function debug(...args: unknown[]): void {
  if (currentLevel <= getLevelValue('debug')) {
    console.debug('[stash] DEBUG', ...args)
  }
}

function info(...args: unknown[]): void {
  if (currentLevel <= getLevelValue('info')) {
    console.info('[stash] INFO', ...args)
  }
}

function warn(...args: unknown[]): void {
  if (currentLevel <= getLevelValue('warn')) {
    console.warn('[stash:warn]', ...args)
  }
}

function error(...args: unknown[]): void {
  if (currentLevel <= getLevelValue('error')) {
    console.error('[stash] ERROR', ...args)
  }
}

export const logger = {
  debug,
  info,
  warn,
  error,
}
