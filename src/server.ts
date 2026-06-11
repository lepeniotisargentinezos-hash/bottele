import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { createHttpErrorHandler } from './middleware';
import type { StatusService } from './services/status.service';
import type { Logger } from './utils/logger';

export interface BuildServerOptions {
  statusService: StatusService;
  logger: Logger;
}

/**
 * Servidor HTTP de observabilidade:
 *  - GET /health  → healthcheck simples (Docker/load balancer)
 *  - GET /metrics → métricas internas (jobs, dependências)
 */
export async function buildServer(options: BuildServerOptions): Promise<FastifyInstance> {
  const server = Fastify({ logger: false, trustProxy: true });

  await server.register(rateLimit, { max: 60, timeWindow: '1 minute' });
  server.setErrorHandler(createHttpErrorHandler(options.logger));

  server.get('/health', async (_request, reply) => {
    const health = await options.statusService.health();
    return reply.status(health.status === 'ok' ? 200 : 503).send({ status: health.status });
  });

  server.get('/metrics', async () => {
    const health = await options.statusService.health();
    return {
      status: health.status,
      uptimeSeconds: health.uptimeSeconds,
      dependencies: { database: health.database, vercelApi: health.vercelApi },
      jobs: health.jobs.map((job) => ({
        name: job.name,
        schedule: job.schedule,
        lastRunAt: job.lastRunAt,
        lastSuccessAt: job.lastSuccessAt,
        lastError: job.lastError,
        runs: job.runs,
        failures: job.failures,
        running: job.running,
      })),
    };
  });

  return server;
}
