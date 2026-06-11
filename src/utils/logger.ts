import pino from 'pino';
import { env } from '../config/env';

export const logger = pino({
  level: env.LOG_LEVEL,
  // Nunca logar segredos, mesmo que apareçam em objetos de contexto.
  redact: {
    paths: [
      'token',
      '*.token',
      'authorization',
      '*.authorization',
      'headers.authorization',
      'TELEGRAM_BOT_TOKEN',
      'VERCEL_TOKEN',
      'DATABASE_URL',
    ],
    censor: '[REDACTED]',
  },
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
      : undefined,
});

export type Logger = typeof logger;
