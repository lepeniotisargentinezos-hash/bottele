import { describe, expect, it, vi } from 'vitest';
import { AnalyticsService } from '../../src/services/analytics.service';
import { logger } from '../../src/utils/logger';

function build() {
  const repo = {
    createMany: vi.fn().mockResolvedValue(2),
    totals: vi.fn().mockResolvedValue({ visitors: 10, pageViews: 40 }),
    totalsByProject: vi.fn().mockResolvedValue([]),
    topBy: vi.fn().mockResolvedValue([]),
  };
  return { service: new AnalyticsService(repo as never, logger), repo };
}

const pageview = {
  schema: 'vercel.analytics.v2',
  eventType: 'pageview',
  timestamp: 1700000000000,
  projectId: 'prj_1',
  path: '/',
  deviceId: 67890,
  sessionId: 12345,
  country: 'BR',
  deviceType: 'mobile',
};

describe('AnalyticsService.ingest', () => {
  it('mapeia e grava eventos do drain', async () => {
    const { service, repo } = build();
    const count = await service.ingest([pageview]);

    expect(count).toBe(2);
    const rows = repo.createMany.mock.calls[0][0];
    expect(rows[0]).toMatchObject({
      projectId: 'prj_1',
      eventType: 'pageview',
      path: '/',
      deviceId: '67890', // number convertido para string
      country: 'BR',
    });
    expect(rows[0].occurredAt).toEqual(new Date(1700000000000));
  });

  it('ignora eventos de tipo desconhecido', async () => {
    const { service, repo } = build();
    await service.ingest([{ eventType: 'unknown' }, { eventType: 'web-vital' }]);
    expect(repo.createMany).not.toHaveBeenCalled();
  });

  it('aceita custom events', async () => {
    const { service, repo } = build();
    await service.ingest([{ eventType: 'event', eventName: 'click', timestamp: 1 }]);
    const rows = repo.createMany.mock.calls[0][0];
    expect(rows[0]).toMatchObject({ eventType: 'event', eventName: 'click' });
  });

  it('não derruba ao falhar a gravação', async () => {
    const { service, repo } = build();
    repo.createMany.mockRejectedValue(new Error('db down'));
    expect(await service.ingest([pageview])).toBe(0);
  });

  it('expõe consultas de totais', async () => {
    const { service } = build();
    const totals = await service.totals(new Date(0), new Date());
    expect(totals).toEqual({ visitors: 10, pageViews: 40 });
  });
});
