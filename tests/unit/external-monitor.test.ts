import { describe, expect, it, vi } from 'vitest';
import { ExternalMonitorService } from '../../src/services/external-monitor.service';
import type { HttpChecker } from '../../src/services/uptime.service';
import type { UptimeCheckResult } from '../../src/types';
import { logger } from '../../src/utils/logger';

const ok: UptimeCheckResult = {
  url: 'https://api.anubispay.com/v1',
  success: true,
  statusCode: 401,
  responseTimeMs: 120,
  errorType: null,
  reason: null,
};
const down: UptimeCheckResult = {
  url: 'https://api.anubispay.com/v1',
  success: false,
  statusCode: 503,
  responseTimeMs: 90,
  errorType: 'HTTP_ERROR',
  reason: 'HTTP 503',
};

function build(result: UptimeCheckResult, storedState: unknown = {}) {
  const monitors = [{ name: 'anubispay', url: 'https://api.anubispay.com/v1' }];
  const settings = { getExternalMonitors: vi.fn().mockResolvedValue(monitors) };
  const store: Record<string, unknown> = { external_monitor_state: storedState };
  const settingsRepo = {
    get: vi.fn().mockImplementation((k: string) => Promise.resolve(store[k] ?? null)),
    set: vi.fn().mockImplementation((k: string, v: unknown) => {
      store[k] = v;
      return Promise.resolve();
    }),
  };
  const notifier = { send: vi.fn().mockResolvedValue(true) };
  const checker: HttpChecker = { check: vi.fn().mockResolvedValue(result) };

  const service = new ExternalMonitorService(
    settings as never,
    settingsRepo as never,
    notifier as never,
    checker,
    10_000,
    logger,
  );
  return { service, notifier };
}

describe('ExternalMonitorService', () => {
  it('alerta quando o gateway cai', async () => {
    const { service, notifier } = build(down);
    await service.checkAll();
    expect(notifier.send).toHaveBeenCalledWith(
      'SYSTEM',
      expect.stringContaining('SERVIÇO EXTERNO FORA DO AR'),
      expect.anything(),
    );
  });

  it('não repete o alerta enquanto continua fora', async () => {
    const { service, notifier } = build(down, {
      anubispay: { down: true, since: new Date().toISOString() },
    });
    await service.checkAll();
    expect(notifier.send).not.toHaveBeenCalled();
  });

  it('avisa quando o gateway volta', async () => {
    const since = new Date(Date.now() - 5 * 60_000).toISOString();
    const { service, notifier } = build(ok, { anubispay: { down: true, since } });
    await service.checkAll();
    expect(notifier.send).toHaveBeenCalledWith(
      'SYSTEM',
      expect.stringContaining('RESTABELECIDO'),
      expect.anything(),
    );
  });

  it('não alerta quando está tudo no ar', async () => {
    const { service, notifier } = build(ok);
    await service.checkAll();
    expect(notifier.send).not.toHaveBeenCalled();
  });

  it('liveStatus retorna o estado de cada serviço', async () => {
    const { service } = build(ok);
    const status = await service.liveStatus();
    expect(status).toHaveLength(1);
    expect(status[0]?.name).toBe('anubispay');
    expect(status[0]?.result.success).toBe(true);
  });

  it('inspect extrai host, status e conta do corpo /api/health', async () => {
    const { service } = build(ok);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ ok: true, account: 'Conta Principal' }), { status: 200 }),
        ),
    );

    const result = await service.inspect();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: 'anubispay',
      host: 'api.anubispay.com',
      ok: true,
      account: 'Conta Principal',
    });
    vi.unstubAllGlobals();
  });

  it('inspect retorna account null quando o serviço falha', async () => {
    const { service } = build(ok);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));

    const result = await service.inspect();
    expect(result[0]).toMatchObject({ ok: false, account: null });
    vi.unstubAllGlobals();
  });

  it('accountForHost lê a conta do /api/health de um host', async () => {
    const { service } = build(ok);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ ok: true, account: 'G-P646' }), { status: 200 }),
        ),
    );
    expect(await service.accountForHost('creditofacilonline.lol')).toBe('G-P646');
    vi.unstubAllGlobals();
  });

  it('accountForHost retorna null quando falha', async () => {
    const { service } = build(ok);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    expect(await service.accountForHost('x.com')).toBeNull();
    vi.unstubAllGlobals();
  });

  it('inspect anexa o MONITOR_TOKEN à URL quando configurado', async () => {
    const monitors = [{ name: 'anubispay', url: 'https://api.anubispay.com/v1/health' }];
    const settings = { getExternalMonitors: vi.fn().mockResolvedValue(monitors) };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true, account: 'X' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const service = new ExternalMonitorService(
      settings as never,
      { get: vi.fn(), set: vi.fn() } as never,
      { send: vi.fn() } as never,
      { check: vi.fn() } as never,
      10_000,
      logger,
      'meu-token-secreto',
    );

    await service.inspect();

    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain('token=meu-token-secreto');
    vi.unstubAllGlobals();
  });
});
