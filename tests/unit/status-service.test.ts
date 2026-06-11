import { describe, expect, it, vi } from 'vitest';
import { StatusService } from '../../src/services/status.service';

function buildService(options: { dbOk?: boolean; vercelOk?: boolean } = {}) {
  const prisma = {
    $queryRaw:
      options.dbOk === false
        ? vi.fn().mockRejectedValue(new Error('db down'))
        : vi.fn().mockResolvedValue([{ '?column?': 1 }]),
  };
  const projects = {
    count: vi.fn().mockResolvedValue(15),
    countActive: vi.fn().mockResolvedValue(14),
    lastSyncAt: vi.fn().mockResolvedValue(new Date('2026-06-11T10:00:00Z')),
  };
  const deployments = {
    countSince: vi.fn().mockResolvedValue(27),
    countByStateSince: vi.fn().mockResolvedValue(2),
  };
  const incidents = { countOpen: vi.fn().mockResolvedValue(1) };
  const uptime = { globalUptimePercent: vi.fn().mockResolvedValue(99.98) };
  const vercel = { ping: vi.fn().mockResolvedValue(options.vercelOk ?? true) };
  const jobStatusProvider = {
    list: vi.fn().mockReturnValue([{ name: 'uptime-check', runs: 5, failures: 0 }]),
  };

  return new StatusService(
    prisma as never,
    projects as never,
    deployments as never,
    incidents as never,
    uptime as never,
    vercel as never,
    jobStatusProvider as never,
  );
}

describe('StatusService', () => {
  it('monta a visão geral da conta', async () => {
    const service = buildService();
    const overview = await service.accountOverview();

    expect(overview).toMatchObject({
      totalProjects: 15,
      activeProjects: 14,
      openIncidents: 1,
      deploysLast24h: 27,
      failedDeploysLast24h: 2,
    });
    expect(overview.uptimePercent24h).toBeCloseTo(99.98);
  });

  it('health ok quando todas as dependências respondem', async () => {
    const service = buildService();
    const health = await service.health();

    expect(health.status).toBe('ok');
    expect(health.database).toBe(true);
    expect(health.vercelApi).toBe(true);
    expect(health.jobs).toHaveLength(1);
  });

  it('health degraded quando o banco está fora', async () => {
    const service = buildService({ dbOk: false });
    const health = await service.health();

    expect(health.status).toBe('degraded');
    expect(health.database).toBe(false);
  });

  it('health degraded quando a API da Vercel está fora', async () => {
    const service = buildService({ vercelOk: false });
    const health = await service.health();
    expect(health.status).toBe('degraded');
  });
});
