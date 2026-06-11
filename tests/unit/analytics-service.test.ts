import { describe, expect, it, vi } from 'vitest';
import { AnalyticsService } from '../../src/services/analytics.service';
import { logger } from '../../src/utils/logger';

const statsFixture = {
  visitors: 1200,
  uniqueVisitors: 900,
  pageViews: 3400,
  topPages: [{ page: '/', views: 1000 }],
  countries: [{ country: 'BR', visitors: 800 }],
  devices: [{ device: 'Mac OS', visitors: 500 }],
};

function buildService(webAnalyticsResult: unknown) {
  const vercel = { getWebAnalytics: vi.fn().mockResolvedValue(webAnalyticsResult) };
  const projects = {
    findAllActive: vi.fn().mockResolvedValue([
      { id: 'prj_1', name: 'dashboard-app' },
      { id: 'prj_2', name: 'landing-page' },
    ]),
  };
  const analytics = {
    upsertSnapshot: vi.fn().mockResolvedValue({}),
    totalsBetween: vi.fn().mockResolvedValue({ visitors: 1, uniqueVisitors: 1, pageViews: 1 }),
    totalsByProjectBetween: vi
      .fn()
      .mockResolvedValue([
        { projectId: 'prj_1', projectName: 'dashboard-app', visitors: 10, pageViews: 100 },
      ]),
  };

  const service = new AnalyticsService(
    vercel as never,
    projects as never,
    analytics as never,
    logger,
  );

  return { service, analytics, vercel };
}

describe('AnalyticsService', () => {
  it('persiste snapshots quando a API retorna dados', async () => {
    const { service, analytics } = buildService(statsFixture);
    const result = await service.collectDailySnapshots();

    expect(result.collected).toBe(2);
    expect(result.unavailable).toBe(0);
    expect(analytics.upsertSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'prj_1', visitors: 1200, pageViews: 3400 }),
    );
  });

  it('degrada graciosamente quando analytics não está disponível', async () => {
    const { service, analytics } = buildService(null);
    const result = await service.collectDailySnapshots();

    expect(result.collected).toBe(0);
    expect(result.unavailable).toBe(2);
    expect(analytics.upsertSnapshot).not.toHaveBeenCalled();
  });

  it('continua nos demais projetos quando um falha', async () => {
    const { service, vercel } = buildService(statsFixture);
    vercel.getWebAnalytics
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(statsFixture);

    const result = await service.collectDailySnapshots();
    expect(result.collected).toBe(1);
  });

  it('retorna o projeto com mais page views', async () => {
    const { service } = buildService(statsFixture);
    const top = await service.topProjectName(new Date(0), new Date());
    expect(top).toBe('dashboard-app');
  });
});
