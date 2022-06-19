import { transports, createLogger, format } from 'winston'

export const logger = createLogger({
  level: 'debug',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.colorize(),
    format.printf(info => `[${[info.timestamp]}] ${info.level}: ${info.message}`)
  ),
  transports: [new transports.Console()]
})
