import { describe, expect, it, vi } from 'vitest';
import { ReportService } from '../../src/services/report.service';

function buildService() {
  const projects = { countActive: vi.fn().mockResolvedValue(14) };
  const deployments = {
    countSince: vi.fn().mockResolvedValue(27),
    countByStateSince: vi.fn().mockResolvedValue(2),
  };
  const incidents = {
    countOpen: vi.fn().mockResolvedValue(0),
    listSince: vi.fn().mockResolvedValue([{}, {}, {}]),
    totalDowntimeMsSince: vi.fn().mockResolvedValue(12 * 60_000),
  };
  const analytics = {
    totalsBetween: vi
      .fn()
      .mockResolvedValueOnce({ visitors: 12843, uniqueVisitors: 9000, pageViews: 34223 })
      .mockResolvedValue({ visitors: 10000, uniqueVisitors: 8000, pageViews: 30000 }),
    topProjectName: vi.fn().mockResolvedValue('dashboard-app'),
  };
  const uptime = { globalUptimePercent: vi.fn().mockResolvedValue(99.98) };
  const notifier = { send: vi.fn().mockResolvedValue(true) };

  const service = new ReportService(
    projects as never,
    deployments as never,
    incidents as never,
    analytics as never,
    uptime as never,
    notifier as never,
  );

  return { service, notifier };
}

describe('ReportService', () => {
  it('monta o relatório diário com todos os campos', async () => {
    const { service } = buildService();
    const data = await service.buildDailyReport();

    expect(data.monitoredProjects).toBe(14);
    expect(data.visitors).toBe(12843);
    expect(data.pageViews).toBe(34223);
    expect(data.deploys).toBe(27);
    expect(data.failedDeploys).toBe(2);
    expect(data.uptimePercent).toBeCloseTo(99.98);
    expect(data.topProjectName).toBe('dashboard-app');
  });

  it('formata o relatório diário no padrão esperado', async () => {
    const { service } = buildService();
    const data = await service.buildDailyReport();
    const message = service.formatDailyReport(data);

    expect(message).toContain('RELATÓRIO DIÁRIO');
    expect(message).toContain('14');
    expect(message).toContain('12.843');
    expect(message).toContain('34.223');
    expect(message).toContain('99,98%');
    expect(message).toContain('dashboard-app');
  });

  it('envia o relatório diário pelo notificador', async () => {
    const { service, notifier } = buildService();
    await service.sendDailyReport();

    expect(notifier.send).toHaveBeenCalledWith(
      'DAILY_REPORT',
      expect.stringContaining('RELATÓRIO DIÁRIO'),
    );
  });

  it('monta o relatório semanal com crescimento', async () => {
    const { service } = buildService();
    const data = await service.buildWeeklyReport();

    expect(data.visitors).toBe(12843);
    expect(data.visitorsGrowth).toBeCloseTo(28.43, 1);
    expect(data.totalDowntimeMs).toBe(12 * 60_000);

    const message = service.formatWeeklyReport(data);
    expect(message).toContain('RELATÓRIO SEMANAL');
    expect(message).toContain('12 min');
  });
});
