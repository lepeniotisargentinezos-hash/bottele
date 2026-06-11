import { describe, expect, it, vi } from 'vitest';
import { SettingsService } from '../../src/services/settings.service';
import { env } from '../../src/config/env';

function buildService(stored: unknown = null) {
  const repository = {
    get: vi.fn().mockResolvedValue(stored),
    set: vi.fn().mockResolvedValue(undefined),
  };
  return { service: new SettingsService(repository as never, env), repository };
}

describe('SettingsService', () => {
  it('retorna defaults do ambiente quando não há nada persistido', async () => {
    const { service } = buildService();
    const settings = await service.getAlertSettings();

    expect(settings.chatId).toBe(env.CHAT_ID);
    expect(settings.deployFailures).toBe(true);
    expect(settings.downtime).toBe(true);
    expect(settings.latencyThresholdMs).toBe(env.LATENCY_THRESHOLD_MS);
  });

  it('mescla valores persistidos sobre os defaults', async () => {
    const { service } = buildService({ latencyThresholdMs: 500, downtime: false });
    const settings = await service.getAlertSettings();

    expect(settings.latencyThresholdMs).toBe(500);
    expect(settings.downtime).toBe(false);
    expect(settings.deployFailures).toBe(true); // default preservado
  });

  it('persiste atualizações parciais', async () => {
    const { service, repository } = buildService();
    const updated = await service.updateAlertSettings({ p95ThresholdMs: 9999 });

    expect(updated.p95ThresholdMs).toBe(9999);
    expect(repository.set).toHaveBeenCalledWith(
      'alert_settings',
      expect.objectContaining({ p95ThresholdMs: 9999 }),
    );
  });
});
