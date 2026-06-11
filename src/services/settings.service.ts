import type { SettingsRepository } from '../database/repositories/settings.repository';
import type { Env } from '../config/env';
import type { AlertSettings } from '../types';

const ALERT_SETTINGS_KEY = 'alert_settings';

/**
 * Configurações de alerta persistidas no banco, com defaults vindos do ambiente.
 * Permite alterar thresholds/tipos de alerta sem redeploy.
 */
export class SettingsService {
  constructor(
    private readonly repository: SettingsRepository,
    private readonly env: Env,
  ) {}

  defaults(): AlertSettings {
    return {
      chatId: this.env.CHAT_ID,
      deployFailures: true,
      deploySuccess: false,
      downtime: true,
      performance: true,
      newProjects: true,
      latencyThresholdMs: this.env.LATENCY_THRESHOLD_MS,
      p95ThresholdMs: this.env.P95_THRESHOLD_MS,
      p99ThresholdMs: this.env.P99_THRESHOLD_MS,
    };
  }

  async getAlertSettings(): Promise<AlertSettings> {
    const stored = await this.repository.get<Partial<AlertSettings>>(ALERT_SETTINGS_KEY);
    return { ...this.defaults(), ...(stored ?? {}) };
  }

  async updateAlertSettings(patch: Partial<AlertSettings>): Promise<AlertSettings> {
    const merged = { ...(await this.getAlertSettings()), ...patch };
    await this.repository.set(ALERT_SETTINGS_KEY, merged);
    return merged;
  }
}
