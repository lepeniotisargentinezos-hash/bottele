import { describe, expect, it, vi } from 'vitest';
import { SslService, type CertificateChecker } from '../../src/services/ssl.service';
import { logger } from '../../src/utils/logger';

function buildService(daysRemaining: number, storedState: unknown = {}) {
  const projects = {
    findAllActive: vi
      .fn()
      .mockResolvedValue([{ id: 'prj_1', name: 'app', productionUrl: 'https://app.example.com' }]),
  };
  const settingsStore: Record<string, unknown> = { ssl_alert_state: storedState };
  const settings = {
    get: vi.fn().mockImplementation((k: string) => Promise.resolve(settingsStore[k] ?? null)),
    set: vi.fn().mockImplementation((k: string, v: unknown) => {
      settingsStore[k] = v;
      return Promise.resolve();
    }),
  };
  const notifier = { send: vi.fn().mockResolvedValue(true) };
  const validTo = new Date(Date.now() + daysRemaining * 24 * 60 * 60 * 1000);
  const checker: CertificateChecker = {
    check: vi.fn().mockResolvedValue({ validTo, daysRemaining }),
  };

  const service = new SslService(
    projects as never,
    settings as never,
    notifier as never,
    checker,
    10_000,
    logger,
  );
  return { service, notifier, settings };
}

describe('SslService', () => {
  it('não alerta quando o certificado está longe de expirar', async () => {
    const { service, notifier } = buildService(60);
    await service.checkAll();
    expect(notifier.send).not.toHaveBeenCalled();
  });

  it('alerta quando entra na faixa de expiração', async () => {
    const { service, notifier } = buildService(6);
    await service.checkAll();
    expect(notifier.send).toHaveBeenCalledWith(
      'SYSTEM',
      expect.stringContaining('CERTIFICADO SSL EXPIRANDO'),
      expect.anything(),
    );
  });

  it('não repete o alerta na mesma faixa', async () => {
    const { service, notifier } = buildService(6);
    await service.checkAll();
    await service.checkAll();
    expect(notifier.send).toHaveBeenCalledTimes(1);
  });

  it('statusForAll retorna os dias restantes por projeto', async () => {
    const { service } = buildService(20);
    const status = await service.statusForAll();
    expect(status).toEqual([{ project: 'app', hostname: 'app.example.com', daysRemaining: 20 }]);
  });
});
