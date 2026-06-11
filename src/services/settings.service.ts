import type { Prisma } from '@prisma/client';
import type { SettingsRepository } from '../database/repositories/settings.repository';
import type { Env } from '../config/env';
import type { AlertSettings, ExternalMonitor, ProjectCheckConfig } from '../types';

const ALERT_SETTINGS_KEY = 'alert_settings';
const PROJECT_CHECKS_KEY = 'project_checks';
const EXTERNAL_MONITORS_KEY = 'external_monitors';

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

  async getProjectChecks(): Promise<Record<string, ProjectCheckConfig>> {
    return (
      (await this.repository.get<Record<string, ProjectCheckConfig>>(PROJECT_CHECKS_KEY)) ?? {}
    );
  }

  async getProjectCheck(projectId: string): Promise<ProjectCheckConfig> {
    const all = await this.getProjectChecks();
    return all[projectId] ?? { extraUrls: [] };
  }

  async updateProjectCheck(
    projectId: string,
    patch: Partial<ProjectCheckConfig>,
  ): Promise<ProjectCheckConfig> {
    const all = await this.getProjectChecks();
    const merged: ProjectCheckConfig = { ...{ extraUrls: [] }, ...all[projectId], ...patch };
    all[projectId] = merged;
    await this.repository.set(PROJECT_CHECKS_KEY, all as unknown as Prisma.InputJsonValue);
    return merged;
  }

  async getExternalMonitors(): Promise<ExternalMonitor[]> {
    return (await this.repository.get<ExternalMonitor[]>(EXTERNAL_MONITORS_KEY)) ?? [];
  }

  async addExternalMonitor(name: string, url: string): Promise<ExternalMonitor[]> {
    const monitors = (await this.getExternalMonitors()).filter((m) => m.name !== name);
    monitors.push({ name, url });
    await this.repository.set(EXTERNAL_MONITORS_KEY, monitors as unknown as Prisma.InputJsonValue);
    return monitors;
  }

  async removeExternalMonitor(name: string): Promise<ExternalMonitor[]> {
    const monitors = (await this.getExternalMonitors()).filter((m) => m.name !== name);
    await this.repository.set(EXTERNAL_MONITORS_KEY, monitors as unknown as Prisma.InputJsonValue);
    return monitors;
  }
}
