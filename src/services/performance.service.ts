import type { ProjectRepository } from '../database/repositories/project.repository';
import type { MetricRepository } from '../database/repositories/metric.repository';
import type { IncidentRepository } from '../database/repositories/incident.repository';
import type { TelegramNotifier } from '../integrations/telegram/notifier';
import type { SettingsService } from './settings.service';
import type { PerformanceStats } from '../types';
import { average, percentile } from '../utils/stats';
import { escapeHtml, formatMs } from '../utils/format';
import { toErrorMessage } from '../utils/errors';
import type { Logger } from '../utils/logger';

const ANALYSIS_WINDOW_MS = 60 * 60 * 1000; // 1 hora
const MIN_SAMPLES_FOR_ALERT = 5;

/**
 * Calcula latência média, P95 e P99 a partir das métricas coletadas
 * e dispara alertas quando os thresholds configuráveis são excedidos.
 * Usa incidentes do tipo PERFORMANCE para não alertar repetidamente.
 */
export class PerformanceService {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly metrics: MetricRepository,
    private readonly incidents: IncidentRepository,
    private readonly notifier: TelegramNotifier,
    private readonly settings: SettingsService,
    private readonly logger: Logger,
  ) {}

  async statsFor(projectId: string, projectName: string, since: Date): Promise<PerformanceStats> {
    const project = await this.projects.findById(projectId);
    const times = await this.metrics.responseTimesSince(projectId, since);
    return {
      projectId,
      projectName,
      url: project?.productionUrl ?? null,
      samples: times.length,
      avgMs: average(times),
      p95Ms: percentile(times, 95),
      p99Ms: percentile(times, 99),
    };
  }

  async statsForAll(since: Date): Promise<PerformanceStats[]> {
    const projects = await this.projects.findAllActive();
    const stats: PerformanceStats[] = [];
    for (const project of projects) {
      stats.push(await this.statsFor(project.id, project.name, since));
    }
    return stats.filter((s) => s.samples > 0);
  }

  /** Avalia thresholds e abre/fecha incidentes de degradação de performance. */
  async evaluateThresholds(): Promise<void> {
    const alertSettings = await this.settings.getAlertSettings();
    if (!alertSettings.performance) return;

    const since = new Date(Date.now() - ANALYSIS_WINDOW_MS);
    const allStats = await this.statsForAll(since);

    for (const stats of allStats) {
      try {
        if (stats.samples < MIN_SAMPLES_FOR_ALERT) continue;

        const degraded =
          stats.avgMs > alertSettings.latencyThresholdMs ||
          stats.p95Ms > alertSettings.p95ThresholdMs ||
          stats.p99Ms > alertSettings.p99ThresholdMs;

        const openIncident = await this.incidents.findOpen(stats.projectId, 'PERFORMANCE');

        if (degraded && !openIncident) {
          await this.incidents.open({
            projectId: stats.projectId,
            type: 'PERFORMANCE',
            url: stats.url ?? undefined,
            reason: `avg=${Math.round(stats.avgMs)}ms p95=${Math.round(stats.p95Ms)}ms p99=${Math.round(stats.p99Ms)}ms`,
          });

          await this.notifier.send(
            'PERFORMANCE_DEGRADED',
            [
              '🐢 <b>PERFORMANCE DEGRADADA</b>',
              '',
              `Projeto: <b>${escapeHtml(stats.projectName)}</b>`,
              stats.url ? `URL: ${escapeHtml(stats.url)}` : null,
              '',
              `Latência média: ${formatMs(stats.avgMs)} (limite ${formatMs(alertSettings.latencyThresholdMs)})`,
              `P95: ${formatMs(stats.p95Ms)} (limite ${formatMs(alertSettings.p95ThresholdMs)})`,
              `P99: ${formatMs(stats.p99Ms)} (limite ${formatMs(alertSettings.p99ThresholdMs)})`,
              `Amostras: ${stats.samples} (última hora)`,
            ]
              .filter((line): line is string => line !== null)
              .join('\n'),
            { payload: { projectId: stats.projectId, avgMs: stats.avgMs, p95Ms: stats.p95Ms } },
          );
        } else if (!degraded && openIncident) {
          await this.incidents.resolve(openIncident.id);
          await this.notifier.send(
            'PERFORMANCE_DEGRADED',
            [
              '✅ <b>PERFORMANCE NORMALIZADA</b>',
              '',
              `Projeto: <b>${escapeHtml(stats.projectName)}</b>`,
              `Latência média atual: ${formatMs(stats.avgMs)}`,
            ].join('\n'),
            { payload: { projectId: stats.projectId, recovered: true } },
          );
        }
      } catch (error) {
        this.logger.error(
          { project: stats.projectName, error: toErrorMessage(error) },
          'Falha ao avaliar thresholds de performance',
        );
      }
    }
  }
}
