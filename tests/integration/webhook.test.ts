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

describe('POST /drains/analytics (integração)', () => {
  const drainBody = JSON.stringify([
    {
      schema: 'vercel.analytics.v2',
      eventType: 'pageview',
      timestamp: 1700000000000,
      projectId: 'prj_1',
      path: '/',
      deviceId: 1,
      sessionId: 2,
    },
  ]);

  async function buildDrainServer(handler = vi.fn().mockResolvedValue(undefined)) {
    const server = await buildServer({
      statusService: { health: vi.fn().mockResolvedValue(healthyReport) } as never,
      logger,
      drain: { secret: SECRET, handler },
    });
    return { server, handler };
  }

  it('aceita eventos com assinatura válida e os despacha', async () => {
    const { server, handler } = await buildDrainServer();
    const response = await server.inject({
      method: 'POST',
      url: '/drains/analytics',
      headers: { 'content-type': 'application/json', 'x-vercel-signature': sign(drainBody) },
      payload: drainBody,
    });

    expect(response.statusCode).toBe(200);
    await new Promise((resolve) => setImmediate(resolve));
    expect(handler).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ eventType: 'pageview' })]),
    );
    await server.close();
  });

  it('aceita NDJSON', async () => {
    const ndjson =
      '{"eventType":"pageview","timestamp":1,"deviceId":1}\n{"eventType":"pageview","timestamp":2,"deviceId":2}';
    const { server, handler } = await buildDrainServer();
    const response = await server.inject({
      method: 'POST',
      url: '/drains/analytics',
      headers: { 'content-type': 'application/x-ndjson', 'x-vercel-signature': sign(ndjson) },
      payload: ndjson,
    });

    expect(response.statusCode).toBe(200);
    await new Promise((resolve) => setImmediate(resolve));
    const events = handler.mock.calls[0][0];
    expect(events).toHaveLength(2);
    await server.close();
  });

  it('rejeita assinatura inválida com 403', async () => {
    const { server, handler } = await buildDrainServer();
    const response = await server.inject({
      method: 'POST',
      url: '/drains/analytics',
      headers: { 'content-type': 'application/json', 'x-vercel-signature': 'errada' },
      payload: drainBody,
    });

    expect(response.statusCode).toBe(403);
    expect(handler).not.toHaveBeenCalled();
    await server.close();
  });
});

describe('POST /webhooks/anubispay (integração)', () => {
  const saleBody = JSON.stringify({ Id: 'tx1', Amount: 100, Status: 'PAID' });

  async function buildAnubisServer(handler = vi.fn().mockResolvedValue(undefined)) {
    const server = await buildServer({
      statusService: { health: vi.fn().mockResolvedValue(healthyReport) } as never,
      logger,
      anubis: { token: 'anubis-token', handler },
    });
    return { server, handler };
  }

  it('aceita evento com token correto na query', async () => {
    const { server, handler } = await buildAnubisServer();
    const response = await server.inject({
      method: 'POST',
      url: '/webhooks/anubispay?token=anubis-token',
      headers: { 'content-type': 'application/json' },
      payload: saleBody,
    });

    expect(response.statusCode).toBe(200);
    await new Promise((resolve) => setImmediate(resolve));
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ Id: 'tx1', Status: 'PAID' }));
    await server.close();
  });

  it('rejeita token inválido ou ausente com 401', async () => {
    const { server, handler } = await buildAnubisServer();
    const semToken = await server.inject({
      method: 'POST',
      url: '/webhooks/anubispay',
      headers: { 'content-type': 'application/json' },
      payload: saleBody,
    });
    const tokenErrado = await server.inject({
      method: 'POST',
      url: '/webhooks/anubispay?token=errado',
      headers: { 'content-type': 'application/json' },
      payload: saleBody,
    });

    expect(semToken.statusCode).toBe(401);
    expect(tokenErrado.statusCode).toBe(401);
    expect(handler).not.toHaveBeenCalled();
    await server.close();
  });
});
