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

export interface DrainOptions {
  secret: string;
  handler: (events: unknown[]) => Promise<void>;
}

export interface AnubisOptions {
  token: string;
  handler: (event: unknown) => Promise<void>;
}

export interface BuildServerOptions {
  statusService: StatusService;
  logger: Logger;
  webhook?: WebhookOptions;
  drain?: DrainOptions;
  anubis?: AnubisOptions;
  /** Quando definido, protege /metrics (exige ?token=). */
  adminToken?: string;
}

/** Comparação de tokens em tempo constante. */
function tokensMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

function verifySignature(rawBody: Buffer, signature: string, secret: string): boolean {
  const expected = createHmac('sha1', secret).update(rawBody).digest('hex');
  const received = Buffer.from(signature, 'utf8');
  const computed = Buffer.from(expected, 'utf8');
  return received.length === computed.length && timingSafeEqual(received, computed);
}

/** Aceita tanto JSON array quanto NDJSON (formatos suportados pelos Drains). */
function parseDrainBody(raw: string): unknown[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    // NDJSON: um objeto JSON por linha.
    return trimmed
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }
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

  server.get('/metrics', async (request, reply) => {
    // /metrics revela a arquitetura interna; quando há adminToken, exige-o.
    if (options.adminToken) {
      const provided = (request.query as { token?: string }).token ?? '';
      if (!tokensMatch(provided, options.adminToken)) {
        return reply.status(401).send({ error: 'unauthorized' });
      }
    }
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

  if (options.webhook || options.drain || options.anubis) {
    const { logger } = options;
    const webhook = options.webhook;
    const drain = options.drain;
    const anubis = options.anubis;

    // Escopo isolado: parser de corpo bruto (necessário para o HMAC)
    // sem afetar as demais rotas.
    await server.register(async (scope) => {
      scope.addContentTypeParser(
        ['application/json', 'application/x-ndjson', 'text/plain'],
        { parseAs: 'buffer' },
        (_request, body, done) => done(null, body),
      );

      if (webhook) {
        scope.post(
          '/webhooks/vercel',
          // Rajadas de deploys legítimas não devem cair no rate limit global.
          { config: { rateLimit: false } },
          async (request, reply) => {
            const rawBody = request.body as Buffer;
            const signature = request.headers['x-vercel-signature'];

            if (
              typeof signature !== 'string' ||
              !verifySignature(rawBody, signature, webhook.secret)
            ) {
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
            void webhook
              .handler(event)
              .catch((error) =>
                logger.error({ error: String(error) }, 'Erro ao processar webhook'),
              );

            return reply.status(200).send({ received: true });
          },
        );
      }

      if (drain) {
        scope.post(
          '/drains/analytics',
          { config: { rateLimit: false } },
          async (request, reply) => {
            const rawBody = request.body as Buffer;
            const signature = request.headers['x-vercel-signature'];

            if (
              typeof signature !== 'string' ||
              !verifySignature(rawBody, signature, drain.secret)
            ) {
              logger.warn({ ip: request.ip }, 'Drain com assinatura inválida rejeitado');
              return reply.status(403).send({ error: 'invalid signature' });
            }

            let events: unknown[];
            try {
              events = parseDrainBody(rawBody.toString('utf8'));
            } catch {
              return reply.status(400).send({ error: 'invalid payload' });
            }

            void drain
              .handler(events)
              .catch((error) => logger.error({ error: String(error) }, 'Erro ao processar drain'));

            // Drains exigem 200 OK, senão marcam falha e reenviam.
            return reply.status(200).send({ received: events.length });
          },
        );
      }

      if (anubis) {
        scope.post(
          '/webhooks/anubispay',
          { config: { rateLimit: false } },
          async (request, reply) => {
            // AnubisPay não assina os webhooks; protegemos com token na query.
            const provided =
              typeof (request.query as { token?: string }).token === 'string'
                ? (request.query as { token: string }).token
                : '';
            if (!tokensMatch(provided, anubis.token)) {
              logger.warn({ ip: request.ip }, 'Webhook AnubisPay com token inválido rejeitado');
              return reply.status(401).send({ error: 'invalid token' });
            }

            let event: unknown;
            try {
              event = JSON.parse((request.body as Buffer).toString('utf8'));
            } catch {
              return reply.status(400).send({ error: 'invalid payload' });
            }

            void anubis
              .handler(event)
              .catch((error) =>
                logger.error({ error: String(error) }, 'Erro ao processar webhook AnubisPay'),
              );

            return reply.status(200).send({ received: true });
          },
        );
      }
    });
  }

  return server;
}
