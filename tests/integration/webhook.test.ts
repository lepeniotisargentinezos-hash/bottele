import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { buildServer } from '../../src/server';
import { logger } from '../../src/utils/logger';
import type { HealthReport } from '../../src/services/status.service';

const SECRET = 'whsec_test_123';

const healthyReport: HealthReport = {
  status: 'ok',
  uptimeSeconds: 1,
  database: true,
  vercelApi: true,
  jobs: [],
};

function sign(body: string): string {
  return createHmac('sha1', SECRET).update(Buffer.from(body)).digest('hex');
}

async function buildTestServer(handler = vi.fn().mockResolvedValue(undefined)) {
  const server = await buildServer({
    statusService: { health: vi.fn().mockResolvedValue(healthyReport) } as never,
    logger,
    webhook: { secret: SECRET, handler },
  });
  return { server, handler };
}

const eventBody = JSON.stringify({
  id: 'evt_1',
  type: 'deployment.created',
  createdAt: 1700000000000,
  payload: {
    deployment: { id: 'dpl_1', url: 'app-abc.vercel.app', name: 'dashboard-app' },
    project: { id: 'prj_1' },
    target: 'production',
  },
});

describe('POST /webhooks/vercel (integração)', () => {
  it('aceita evento com assinatura válida e despacha para o handler', async () => {
    const { server, handler } = await buildTestServer();

    const response = await server.inject({
      method: 'POST',
      url: '/webhooks/vercel',
      headers: { 'content-type': 'application/json', 'x-vercel-signature': sign(eventBody) },
      payload: eventBody,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ received: true });
    // O handler roda em background; aguarda o microtask.
    await new Promise((resolve) => setImmediate(resolve));
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: 'deployment.created' }));
    await server.close();
  });

  it('rejeita assinatura inválida com 401', async () => {
    const { server, handler } = await buildTestServer();

    const response = await server.inject({
      method: 'POST',
      url: '/webhooks/vercel',
      headers: { 'content-type': 'application/json', 'x-vercel-signature': 'assinatura-falsa' },
      payload: eventBody,
    });

    expect(response.statusCode).toBe(401);
    expect(handler).not.toHaveBeenCalled();
    await server.close();
  });

  it('rejeita requisição sem assinatura', async () => {
    const { server } = await buildTestServer();

    const response = await server.inject({
      method: 'POST',
      url: '/webhooks/vercel',
      headers: { 'content-type': 'application/json' },
      payload: eventBody,
    });

    expect(response.statusCode).toBe(401);
    await server.close();
  });

  it('rejeita JSON malformado (assinado) com 400', async () => {
    const { server } = await buildTestServer();
    const broken = '{nao-e-json';

    const response = await server.inject({
      method: 'POST',
      url: '/webhooks/vercel',
      headers: { 'content-type': 'application/json', 'x-vercel-signature': sign(broken) },
      payload: broken,
    });

    expect(response.statusCode).toBe(400);
    await server.close();
  });

  it('rota não existe quando o webhook não está configurado', async () => {
    const server = await buildServer({
      statusService: { health: vi.fn().mockResolvedValue(healthyReport) } as never,
      logger,
    });

    const response = await server.inject({
      method: 'POST',
      url: '/webhooks/vercel',
      headers: { 'content-type': 'application/json' },
      payload: eventBody,
    });

    expect(response.statusCode).toBe(404);
    await server.close();
  });
});
