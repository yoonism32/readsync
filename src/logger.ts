import pino from 'pino';
import { IS_PRODUCTION } from './config.js';

const logger = pino(
  IS_PRODUCTION
    ? { level: 'info' }
    : {
        level: 'debug',
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      },
);

export default logger;
