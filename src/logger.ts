import pino from 'pino';
import { IS_PRODUCTION } from './config.js';

const logger = pino(
  IS_PRODUCTION
    ? {
        level: 'info',
        redact: {
          paths: [
            'password',
            'api_key',
            'user_key',
            '*.password',
            '*.api_key',
            '*.user_key',
            'req.headers.authorization',
            'req.headers.cookie',
          ],
          censor: '[REDACTED]',
        },
      }
    : {
        level: 'debug',
        redact: {
          paths: [
            'password',
            'api_key',
            'user_key',
            '*.password',
            '*.api_key',
            '*.user_key',
            'req.headers.authorization',
            'req.headers.cookie',
          ],
          censor: '[REDACTED]',
        },
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
