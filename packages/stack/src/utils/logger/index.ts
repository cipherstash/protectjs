import { initLogger, createRequestLogger } from 'evlog'
import type { LoggerConfig } from 'evlog'

export type LoggingConfig = {
  enabled?: boolean
  pretty?: boolean
  drain?: LoggerConfig['drain']
}

function samplingFromEnv() {
  const env = process.env.STASH_LOG_LEVEL
  if (!env) return undefined
  const levels = ['debug', 'info', 'warn', 'error'] as const
  const idx = levels.indexOf(env as (typeof levels)[number])
  if (idx === -1) return undefined
  return Object.fromEntries(levels.map((l, i) => [l, i >= idx ? 100 : 0]))
}

let initialized = false

export function initStackLogger(config?: LoggingConfig): void {
  if (initialized) return
  initialized = true
  const rates = samplingFromEnv()
  initLogger({
    env: { service: '@cipherstash/stack' },
    enabled: config?.enabled ?? true,
    pretty: config?.pretty,
    ...(rates && { sampling: { rates } }),
    ...(config?.drain && { drain: config.drain }),
  })
}

// Auto-init with defaults on first import
initStackLogger()

export { createRequestLogger }

// Stringify only the first arg (the message string); drop subsequent args
// which may contain sensitive objects (e.g. encryptConfig, plaintext).
function safeMessage(args: unknown[]): string {
  return typeof args[0] === 'string' ? args[0] : ''
}

// Legacy logger for simple one-off logs (used by encryption/ffi/index.ts + identity/index.ts)
export const logger = {
  debug(...args: unknown[]) {
    const log = createRequestLogger()
    log.set({ level: 'debug', source: '@cipherstash/stack', message: safeMessage(args) })
    log.emit()
  },
  info(...args: unknown[]) {
    const log = createRequestLogger()
    log.set({ source: '@cipherstash/stack' })
    log.info(safeMessage(args))
    log.emit()
  },
  warn(...args: unknown[]) {
    const log = createRequestLogger()
    log.warn(safeMessage(args))
    log.emit()
  },
  error(...args: unknown[]) {
    const log = createRequestLogger()
    log.error(safeMessage(args))
    log.emit()
  },
}
