const util = require('node:util')
const log = {
  debug: util.debuglog('jseql-debug'),
  error: util.debuglog('jseql-error'),
  info: util.debuglog('jseql-info'),
}

export const logger = {
  // biome-ignore lint/suspicious/noExplicitAny: jseql-debug is not typed
  debug: (...args: any[]) => log.debug(...args),
  // biome-ignore lint/suspicious/noExplicitAny: jseql-error is not typed
  error: (...args: any[]) => log.error(...args),
  // biome-ignore lint/suspicious/noExplicitAny: jseql-info is not typed
  info: (...args: any[]) => log.info(...args),
}
