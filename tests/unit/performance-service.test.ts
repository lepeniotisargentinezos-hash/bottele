import { describe, expect, it, vi } from 'vitest';
import { PerformanceService } from '../../src/services/performance.service';
import { logger } from '../../src/utils/logger';

function buildService(options: {
  responseTimes: number[];
  openIncident?: unknown;
  performanceEnabled?: boolean;
}) {
  const projects = {
    findAllActive: vi
      .fn()
      .mockResolvedValue([
        { id: 'prj_1', name: 'dashboard-app', productionUrl: 'https://dash.example.com' },
      ]),
    findById: vi.fn().mockResolvedValue({ id: 'prj_1', productionUrl: 'https://dash.example.com' }),
  };
  const metrics = {
    responseTimesSince: vi.fn().mockResolvedValue(options.responseTimes),
  };
  const incidents = {
    findOpen: vi.fn().mockResolvedValue(options.openIncident ?? null),
    open: vi.fn().mockResolvedValue({ id: 'inc_perf' }),
    resolve: vi.fn().mockResolvedValue({ id: 'inc_perf' }),
  };
  const notifier = { send: vi.fn().mockResolvedValue(true) };
  const settings = {
    getAlertSettings: vi.fn().mockResolvedValue({
      performance: options.performanceEnabled ?? true,
      latencyThresholdMs: 2000,
      p95ThresholdMs: 4000,
      p99ThresholdMs: 8000,
    }),
  };

  const service = new PerformanceService(
    projects as never,
    metrics as never,
    incidents as never,
    notifier as never,
    settings as never,
    logger,
  );

  return { service, incidents, notifier };
}

describe('PerformanceService', () => {
  it('calcula média, P95 e P99', async () => {
    const { service } = buildService({ responseTimes: [100, 200, 300, 400, 500] });
    const stats = await service.statsFor('prj_1', 'dashboard-app', new Date(0));

    expect(stats.samples).toBe(5);
    expect(stats.avgMs).toBe(300);
    expect(stats.p95Ms).toBeGreaterThan(400);
    expect(stats.p99Ms).toBeGreaterThan(stats.p95Ms - 100);
  });

  it('abre incidente e alerta quando latência excede o threshold', async () => {
    const slow = Array.from({ length: 10 }, () => 5000);
    const { service, incidents, notifier } = buildService({ responseTimes: slow });

    await service.evaluateThresholds();

    expect(incidents.open).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'prj_1', type: 'PERFORMANCE' }),
    );
    expect(notifier.send).toHaveBeenCalledWith(
      'PERFORMANCE_DEGRADED',
      expect.stringContaining('PERFORMANCE DEGRADADA'),
      expect.anything(),
    );
  });

  it('não alerta com poucas amostras', async () => {
    const { service, incidents } = buildService({ responseTimes: [9000, 9000] });
    await service.evaluateThresholds();
    expect(incidents.open).not.toHaveBeenCalled();
  });

  it('não duplica incidente de performance já aberto', async () => {
    const slow = Array.from({ length: 10 }, () => 5000);
    const { service, incidents, notifier } = buildService({
      responseTimes: slow,
      openIncident: { id: 'inc_existing' },
    });

    await service.evaluateThresholds();

    expect(incidents.open).not.toHaveBeenCalled();
    expect(notifier.send).not.toHaveBeenCalled();
  });

  it('resolve incidente e avisa quando a performance normaliza', async () => {
    const fast = Array.from({ length: 10 }, () => 150);
    const { service, incidents, notifier } = buildService({
      responseTimes: fast,
      openIncident: { id: 'inc_perf' },
    });

    await service.evaluateThresholds();

    expect(incidents.resolve).toHaveBeenCalledWith('inc_perf');
    expect(notifier.send).toHaveBeenCalledWith(
      'PERFORMANCE_DEGRADED',
      expect.stringContaining('PERFORMANCE NORMALIZADA'),
      expect.anything(),
    );
  });

  it('respeita a configuração performance=false', async () => {
    const slow = Array.from({ length: 10 }, () => 5000);
    const { service, incidents } = buildService({
      responseTimes: slow,
      performanceEnabled: false,
    });

    await service.evaluateThresholds();
    expect(incidents.open).not.toHaveBeenCalled();
  });
});
