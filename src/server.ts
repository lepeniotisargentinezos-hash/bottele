import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createHttpErrorHandler } from './middleware';
import { renderStatusPage } from './status-page';
import type { StatusService } from './services/status.service';
import type { VercelWebhookEvent } from './services/deployment-live.service';
import type { Logger } from './utils/logger';

export interface WebhookOptions {
  secret: string;
  handler: (event: VercelWebhookEvent) => Promise<void>;
}

export interface BuildServerOptions {
  statusService: StatusService;
  logger: Logger;
  webhook?: WebhookOptions;
}

function verifySignature(rawBody: Buffer, signature: string, secret: string): boolean {
  const expected = createHmac('sha1', secret).update(rawBody).digest('hex');
  const received = Buffer.from(signature, 'utf8');
  const computed = Buffer.from(expected, 'utf8');
  return received.length === computed.length && timingSafeEqual(received, computed);
}

/**
 * Servidor HTTP:
 *  - GET /health           → healthcheck simples (Docker/load balancer)
 *  - GET /metrics          → métricas internas (jobs, dependências)
 *  - POST /webhooks/vercel → eventos de deployment em tempo real (quando configurado)
 */
export async function buildServer(options: BuildServerOptions): Promise<FastifyInstance> {
  const server = Fastify({ logger: false, trustProxy: true });

  await server.register(rateLimit, { max: 60, timeWindow: '1 minute' });
  server.setErrorHandler(createHttpErrorHandler(options.logger));

  server.get('/health', async (_request, reply) => {
    const health = await options.statusService.health();
    return reply.status(health.status === 'ok' ? 200 : 503).send({ status: health.status });
  });

  // Status page pública (HTML) — compartilhável com clientes.
  server.get('/status', async (_request, reply) => {
    const rows = await options.statusService.projectsStatus();
    const html = renderStatusPage(rows, new Date().toISOString());
    return reply.type('text/html').send(html);
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

  if (options.webhook) {
    const { secret, handler } = options.webhook;
    const { logger } = options;

    // Escopo isolado: parser de corpo bruto (necessário para o HMAC)
    // sem afetar as demais rotas.
    await server.register(async (scope) => {
      scope.addContentTypeParser(
        'application/json',
        { parseAs: 'buffer' },
        (_request, body, done) => done(null, body),
      );

      scope.post(
        '/webhooks/vercel',
        // Rajadas de deploys legítimas não devem cair no rate limit global.
        { config: { rateLimit: false } },
        async (request, reply) => {
          const rawBody = request.body as Buffer;
          const signature = request.headers['x-vercel-signature'];

          if (typeof signature !== 'string' || !verifySignature(rawBody, signature, secret)) {
            logger.warn({ ip: request.ip }, 'Webhook com assinatura inválida rejeitado');
            return reply.status(401).send({ error: 'invalid signature' });
          }

          let event: VercelWebhookEvent;
          try {
            event = JSON.parse(rawBody.toString('utf8')) as VercelWebhookEvent;
          } catch {
            return reply.status(400).send({ error: 'invalid payload' });
          }

          // Responde imediatamente; o processamento segue em background
          // para a Vercel não considerar timeout e reenviar.
          void handler(event).catch((error) =>
            logger.error({ error: String(error) }, 'Erro ao processar webhook'),
          );

          return reply.status(200).send({ received: true });
        },
      );
    });
  }

  return server;
}
