import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

export function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url: env.DATABASE_URL } },
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export type { PrismaClient };
