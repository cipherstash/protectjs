import { debuglog } from 'node:util'
type LoggerFunction = (...args: unknown[]) => void

const log = {
  debug: debuglog('jseql-debug') as LoggerFunction,
  error: debuglog('jseql-error') as LoggerFunction,
  info: debuglog('jseql-info') as LoggerFunction,
}

export const logger = {
  debug: (...args: unknown[]) => log.debug(...args),
  error: (...args: unknown[]) => log.error(...args),
  info: (...args: unknown[]) => log.info(...args),
}
