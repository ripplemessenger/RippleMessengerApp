/**
 * Logger for React Native - routes to console.* only.
 * In production, Metro handles filtering; __DEV__ is available globally.
 */
function format(msg: string, ...args: any[]): string {
  if (args.length === 0) return msg
  return msg + " " + args.map((a) => JSON.stringify(a, null, 2)).join(" ")
}

const Logger = {
  debug: (msg: string, ...args: any[]) => {
    if (__DEV__) console.debug(format(msg, ...args))
  },
  info: (msg: string, ...args: any[]) => {
    console.info(format(msg, ...args))
  },
  warn: (msg: string, ...args: any[]) => {
    console.warn(format(msg, ...args))
  },
  error: (msg: string, ...args: any[]) => {
    console.error(format(msg, ...args))
  },
}

export default Logger
