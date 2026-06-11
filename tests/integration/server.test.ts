import { describe, expect, it, vi } from 'vitest';
import { buildServer } from '../../src/server';
import { logger } from '../../src/utils/logger';
import type { HealthReport } from '../../src/services/status.service';

function buildStatusService(report: HealthReport) {
  return { health: vi.fn().mockResolvedValue(report) };
}

const healthyReport: HealthReport = {
  status: 'ok',
  uptimeSeconds: 120,
  database: true,
  vercelApi: true,
  jobs: [
    {
      name: 'uptime-check',
      schedule: '*/5 * * * *',
      lastRunAt: new Date(),
      lastSuccessAt: new Date(),
      lastError: null,
      running: false,
      runs: 10,
      failures: 0,
    },
  ],
};

describe('HTTP server (integração)', () => {
  it('GET /health responde 200 com status ok', async () => {
    const server = await buildServer({
      statusService: buildStatusService(healthyReport) as never,
      logger,
    });

    const response = await server.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    await server.close();
  });

  it('GET /health responde 503 quando degradado', async () => {
    const server = await buildServer({
      statusService: buildStatusService({
        ...healthyReport,
        status: 'degraded',
        database: false,
      }) as never,
      logger,
    });

    const response = await server.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'degraded' });
    await server.close();
  });

  it('GET /metrics expõe estado dos jobs e dependências', async () => {
    const server = await buildServer({
      statusService: buildStatusService(healthyReport) as never,
      logger,
    });

    const response = await server.inject({ method: 'GET', url: '/metrics' });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.dependencies).toEqual({ database: true, vercelApi: true });
    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0].name).toBe('uptime-check');
    await server.close();
  });

  it('GET /status renderiza a página pública em HTML', async () => {
    const statusService = {
      health: vi.fn().mockResolvedValue(healthyReport),
      projectsStatus: vi.fn().mockResolvedValue([
        { name: 'app-online', up: true, uptimePercent: 100 },
        { name: 'app-offline', up: false, uptimePercent: 80 },
      ]),
    };
    const server = await buildServer({ statusService: statusService as never, logger });

    const response = await server.inject({ method: 'GET', url: '/status' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('app-online');
    expect(response.body).toContain('Instabilidade detectada');
    await server.close();
  });

  it('rota inexistente responde 404', async () => {
    const server = await buildServer({
      statusService: buildStatusService(healthyReport) as never,
      logger,
    });

    const response = await server.inject({ method: 'GET', url: '/nao-existe' });
    expect(response.statusCode).toBe(404);
    await server.close();
  });
});
