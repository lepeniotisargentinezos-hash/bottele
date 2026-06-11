import { describe, expect, it, vi } from 'vitest';
import { UptimeService, classifyFetchError } from '../../src/services/uptime.service';
import type { HttpChecker } from '../../src/services/uptime.service';
import type { UptimeCheckResult } from '../../src/types';
import { logger } from '../../src/utils/logger';

function buildService(checkResult: UptimeCheckResult, openIncident: unknown = null) {
  const projects = {
    findAllActive: vi
      .fn()
      .mockResolvedValue([
        { id: 'prj_1', name: 'dashboard-app', productionUrl: 'https://dashboard.example.com' },
      ]),
  };
  const metrics = { create: vi.fn().mockResolvedValue({}) };
  const incidents = {
    findOpen: vi.fn().mockResolvedValue(openIncident),
    open: vi.fn().mockResolvedValue({ id: 'inc_1' }),
    resolve: vi.fn().mockResolvedValue({
      id: 'inc_1',
      startedAt: new Date(Date.now() - 12 * 60_000),
      resolvedAt: new Date(),
    }),
  };
  const notifier = { send: vi.fn().mockResolvedValue(true) };
  const settings = {
    getAlertSettings: vi.fn().mockResolvedValue({ downtime: true }),
    getProjectCheck: vi.fn().mockResolvedValue({ extraUrls: [] }),
  };
  const checker: HttpChecker = { check: vi.fn().mockResolvedValue(checkResult) };

  const service = new UptimeService(
    projects as never,
    metrics as never,
    incidents as never,
    notifier as never,
    settings as never,
    checker,
    10_000,
    logger,
  );

  return { service, projects, metrics, incidents, notifier };
}

const downResult: UptimeCheckResult = {
  url: 'https://dashboard.example.com',
  success: false,
  statusCode: 500,
  responseTimeMs: 120,
  errorType: 'HTTP_ERROR',
  reason: 'HTTP 500',
};

const upResult: UptimeCheckResult = {
  url: 'https://dashboard.example.com',
  success: true,
  statusCode: 200,
  responseTimeMs: 95,
  errorType: null,
  reason: null,
};

describe('UptimeService.checkAll', () => {
  it('grava métrica em todo check', async () => {
    const { service, metrics } = buildService(upResult);
    await service.checkAll();
    expect(metrics.create).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'prj_1', success: true, statusCode: 200 }),
    );
  });

  it('abre incidente e alerta quando o site cai', async () => {
    const { service, incidents, notifier } = buildService(downResult);
    await service.checkAll();

    expect(incidents.open).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'prj_1', type: 'DOWNTIME', httpStatus: 500 }),
    );
    expect(notifier.send).toHaveBeenCalledWith(
      'SITE_DOWN',
      expect.stringContaining('SITE FORA DO AR'),
      expect.anything(),
    );
    expect(notifier.send).toHaveBeenCalledWith(
      'SITE_DOWN',
      expect.stringContaining('dashboard-app'),
      expect.anything(),
    );
  });

  it('não duplica incidente quando o site continua fora', async () => {
    const { service, incidents, notifier } = buildService(downResult, { id: 'inc_existing' });
    await service.checkAll();

    expect(incidents.open).not.toHaveBeenCalled();
    expect(notifier.send).not.toHaveBeenCalled();
  });

  it('resolve incidente e informa recuperação com duração', async () => {
    const { service, incidents, notifier } = buildService(upResult, { id: 'inc_1' });
    await service.checkAll();

    expect(incidents.resolve).toHaveBeenCalledWith('inc_1');
    expect(notifier.send).toHaveBeenCalledWith(
      'SITE_RECOVERED',
      expect.stringContaining('SERVIÇO RESTABELECIDO'),
      expect.anything(),
    );
    expect(notifier.send).toHaveBeenCalledWith(
      'SITE_RECOVERED',
      expect.stringContaining('12 min'),
      expect.anything(),
    );
  });
});

describe('UptimeService.liveStatusAll', () => {
  it('checa a home de cada projeto e retorna nome, url e resultado', async () => {
    const { service } = buildService(upResult);
    const statuses = await service.liveStatusAll();

    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toMatchObject({
      name: 'dashboard-app',
      url: 'https://dashboard.example.com',
    });
    expect(statuses[0]?.result.success).toBe(true);
  });
});

describe('classifyFetchError', () => {
  it('classifica timeout', () => {
    const error = new Error('timeout');
    error.name = 'TimeoutError';
    expect(classifyFetchError(error).errorType).toBe('TIMEOUT');
  });

  it('classifica erro de DNS', () => {
    const cause = new Error('getaddrinfo ENOTFOUND site.invalido');
    const error = new Error('fetch failed', { cause });
    expect(classifyFetchError(error).errorType).toBe('DNS_ERROR');
  });

  it('classifica erro genérico de rede', () => {
    expect(classifyFetchError(new Error('connection refused')).errorType).toBe('NETWORK_ERROR');
  });
});
