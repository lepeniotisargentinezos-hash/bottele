import { describe, expect, it, vi } from 'vitest';
import { ReportService } from '../../src/services/report.service';

function buildService() {
  const projects = { countActive: vi.fn().mockResolvedValue(14) };
  const deployments = {
    countSince: vi.fn().mockResolvedValue(27),
    countByStateSince: vi.fn().mockResolvedValue(2),
  };
  const incidents = {
    countOpen: vi.fn().mockResolvedValue(1),
    listSince: vi.fn().mockResolvedValue([{}, {}, {}]),
    totalDowntimeMsSince: vi.fn().mockResolvedValue(12 * 60_000),
  };
  const uptime = { globalUptimePercent: vi.fn().mockResolvedValue(99.98) };
  const performance = { statsForAll: vi.fn().mockResolvedValue([]) };
  const notifier = {
    send: vi.fn().mockResolvedValue(true),
    sendPhoto: vi.fn().mockResolvedValue(true),
  };

  const service = new ReportService(
    projects as never,
    deployments as never,
    incidents as never,
    uptime as never,
    performance as never,
    notifier as never,
  );

  return { service, notifier, performance };
}

describe('ReportService', () => {
  it('monta o relatório diário com deploys, falhas e uptime', async () => {
    const { service } = buildService();
    const data = await service.buildDailyReport();

    expect(data.monitoredProjects).toBe(14);
    expect(data.deploys).toBe(27);
    expect(data.failedDeploys).toBe(2);
    expect(data.uptimePercent).toBeCloseTo(99.98);
    expect(data.openIncidents).toBe(1);
  });

  it('formata o relatório diário no padrão esperado', async () => {
    const { service } = buildService();
    const data = await service.buildDailyReport();
    const message = service.formatDailyReport(data);

    expect(message).toContain('RELATÓRIO DIÁRIO');
    expect(message).toContain('14');
    expect(message).toContain('99,98%');
    expect(message).toContain('Incidentes abertos');
    // Não deve mais mencionar visitantes/page views.
    expect(message).not.toMatch(/Visitantes|Page Views/i);
  });

  it('envia o relatório diário pelo notificador', async () => {
    const { service, notifier } = buildService();
    await service.sendDailyReport();

    expect(notifier.send).toHaveBeenCalledWith(
      'DAILY_REPORT',
      expect.stringContaining('RELATÓRIO DIÁRIO'),
    );
  });

  it('monta e formata o relatório semanal', async () => {
    const { service } = buildService();
    const data = await service.buildWeeklyReport();

    expect(data.deploys).toBe(27);
    expect(data.failedDeploys).toBe(2);
    expect(data.incidents).toBe(3);
    expect(data.totalDowntimeMs).toBe(12 * 60_000);

    const message = service.formatWeeklyReport(data);
    expect(message).toContain('RELATÓRIO SEMANAL');
    expect(message).toContain('12 min');
  });
});
