import { describe, expect, it, vi } from 'vitest';
import { ReportService } from '../../src/services/report.service';

function buildService() {
  const projects = { countActive: vi.fn().mockResolvedValue(14) };
  const deployments = {
    countSince: vi.fn().mockResolvedValue(27),
    countBetween: vi.fn().mockResolvedValue(22),
    countByStateSince: vi.fn().mockResolvedValue(2),
    countByStateBetween: vi.fn().mockResolvedValue(3),
  };
  const incidents = {
    listOpen: vi
      .fn()
      .mockResolvedValue([{ project: { name: 'app-x' }, reason: 'HTTP 500', type: 'DOWNTIME' }]),
    listSince: vi.fn().mockResolvedValue([{}, {}, {}]),
    totalDowntimeMsSince: vi.fn().mockResolvedValue(12 * 60_000),
  };
  // since=99.98, janela anterior=99.50
  const uptime = {
    globalUptimePercent: vi.fn().mockResolvedValueOnce(99.98).mockResolvedValueOnce(99.5),
  };
  const performance = {
    statsForAll: vi.fn().mockResolvedValue([
      {
        projectId: 'p1',
        projectName: 'rapido',
        url: null,
        samples: 5,
        avgMs: 100,
        p95Ms: 200,
        p99Ms: 300,
      },
      {
        projectId: 'p2',
        projectName: 'lento',
        url: null,
        samples: 5,
        avgMs: 900,
        p95Ms: 2500,
        p99Ms: 4000,
      },
    ]),
  };
  const ssl = {
    statusForAll: vi.fn().mockResolvedValue([
      { project: 'app-x', hostname: 'app-x.com', daysRemaining: 5 },
      { project: 'app-y', hostname: 'app-y.com', daysRemaining: 200 },
    ]),
  };
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
    ssl as never,
    notifier as never,
  );

  return { service, notifier };
}

describe('ReportService — relatório diário', () => {
  it('agrega métricas, comparação com ontem, incidentes, mais lento e SSL', async () => {
    const { service } = buildService();
    const data = await service.buildDailyReport();

    expect(data.monitoredProjects).toBe(14);
    expect(data.deploys).toBe(27);
    expect(data.deploysPrev).toBe(22);
    expect(data.failedDeploys).toBe(2);
    expect(data.failedDeploysPrev).toBe(3);
    expect(data.uptimePercent).toBeCloseTo(99.98);
    expect(data.uptimePercentPrev).toBeCloseTo(99.5);
    expect(data.openIncidents).toEqual([{ name: 'app-x', reason: 'HTTP 500' }]);
    expect(data.slowestProject).toEqual({ name: 'lento', p95Ms: 2500 });
    // Só o SSL com ≤30 dias entra.
    expect(data.sslExpiring).toEqual([{ project: 'app-x', daysRemaining: 5 }]);
  });

  it('formata o relatório com comparações e seções', async () => {
    const { service } = buildService();
    const message = service.formatDailyReport(await service.buildDailyReport());

    expect(message).toContain('RELATÓRIO DIÁRIO');
    expect(message).toContain('+5 vs ontem'); // 27 deploys vs 22
    expect(message).toContain('vs ontem'); // falhas: 2 vs 3
    expect(message).toContain('pp vs ontem'); // delta de uptime
    expect(message).toContain('Mais lento: lento');
    expect(message).toContain('⚠️ Incidentes abertos');
    expect(message).toContain('app-x — HTTP 500');
    expect(message).toContain('SSL expirando');
  });

  it('mostra "tudo operacional" quando não há incidentes', async () => {
    const { service } = buildService();
    const data = await service.buildDailyReport();
    const message = service.formatDailyReport({ ...data, openIncidents: [] });
    expect(message).toContain('Todos os serviços operacionais');
  });

  it('lida com cenário sem variação, sem performance e sem SSL', async () => {
    const { service } = buildService();
    const base = await service.buildDailyReport();
    const message = service.formatDailyReport({
      ...base,
      deploys: 10,
      deploysPrev: 10,
      uptimePercent: 99.9,
      uptimePercentPrev: 99.9,
      slowestProject: null,
      sslExpiring: [],
    });
    expect(message).toContain('igual a ontem');
    expect(message).toContain('estável vs ontem');
    expect(message).not.toContain('Mais lento');
    expect(message).not.toContain('SSL expirando');
  });

  it('usa o tipo do incidente quando não há motivo descrito', async () => {
    const { service } = buildService();
    const base = await service.buildDailyReport();
    const message = service.formatDailyReport({
      ...base,
      openIncidents: [{ name: 'app-z', reason: 'PERFORMANCE' }],
    });
    expect(message).toContain('app-z — PERFORMANCE');
  });

  it('envia relatório e gráfico de latência', async () => {
    const { service, notifier } = buildService();
    await service.sendDailyReport();
    expect(notifier.send).toHaveBeenCalledWith(
      'DAILY_REPORT',
      expect.stringContaining('RELATÓRIO'),
    );
    expect(notifier.sendPhoto).toHaveBeenCalled();
  });
});

describe('ReportService — relatório semanal', () => {
  it('monta e formata o relatório semanal', async () => {
    const { service } = buildService();
    const data = await service.buildWeeklyReport();

    expect(data.deploys).toBe(27);
    expect(data.incidents).toBe(3);
    expect(data.totalDowntimeMs).toBe(12 * 60_000);

    const message = service.formatWeeklyReport(data);
    expect(message).toContain('RELATÓRIO SEMANAL');
    expect(message).toContain('12 min');
  });
});
