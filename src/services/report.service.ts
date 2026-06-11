import type { ProjectRepository } from '../database/repositories/project.repository';
import type { DeploymentRepository } from '../database/repositories/deployment.repository';
import type { IncidentRepository } from '../database/repositories/incident.repository';
import type { TelegramNotifier } from '../integrations/telegram/notifier';
import type { UptimeService } from './uptime.service';
import type { PerformanceService } from './performance.service';
import type { SslService } from './ssl.service';
import type { DailyReportData, WeeklyReportData } from '../types';
import {
  escapeHtml,
  formatDateTime,
  formatDuration,
  formatMs,
  formatPercent,
} from '../utils/format';
import { latencyChartUrl } from '../utils/charts';
import { env } from '../config/env';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const SSL_REPORT_THRESHOLD_DAYS = 30;

/** Rótulo de variação absoluta entre dois inteiros, ex.: "📈 +5 vs ontem". */
function deltaLabel(current: number, previous: number, invert = false): string {
  const diff = current - previous;
  if (diff === 0) return '➡️ igual a ontem';
  const better = invert ? diff < 0 : diff > 0;
  const arrow = better ? '📈' : '📉';
  const sign = diff > 0 ? '+' : '';
  return `${arrow} ${sign}${diff} vs ontem`;
}

/** Rótulo de variação de disponibilidade em pontos percentuais. */
function uptimeDeltaLabel(current: number, previous: number): string {
  const diff = current - previous;
  if (Math.abs(diff) < 0.01) return '➡️ estável vs ontem';
  const arrow = diff > 0 ? '📈' : '📉';
  const sign = diff > 0 ? '+' : '';
  return `${arrow} ${sign}${diff.toFixed(2).replace('.', ',')} pp vs ontem`;
}

/** Monta e envia os relatórios diário e semanal. */
export class ReportService {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly deployments: DeploymentRepository,
    private readonly incidents: IncidentRepository,
    private readonly uptime: UptimeService,
    private readonly performance: PerformanceService,
    private readonly ssl: SslService,
    private readonly notifier: TelegramNotifier,
  ) {}

  async buildDailyReport(now = new Date()): Promise<DailyReportData> {
    const since = new Date(now.getTime() - DAY_MS);
    const prevFrom = new Date(now.getTime() - 2 * DAY_MS);

    const [
      monitoredProjects,
      deploys,
      deploysPrev,
      failedDeploys,
      failedDeploysPrev,
      uptimePercent,
      uptimePercentPrev,
      openIncidentsList,
      perfStats,
      sslRows,
    ] = await Promise.all([
      this.projects.countActive(),
      this.deployments.countSince(since),
      this.deployments.countBetween(prevFrom, since),
      this.deployments.countByStateSince('ERROR', since),
      this.deployments.countByStateBetween('ERROR', prevFrom, since),
      this.uptime.globalUptimePercent(since),
      this.uptime.globalUptimePercent(prevFrom, since),
      this.incidents.listOpen(),
      this.performance.statsForAll(since),
      this.ssl.statusForAll(),
    ]);

    const slowest = [...perfStats].sort((a, b) => b.p95Ms - a.p95Ms)[0];

    return {
      date: now,
      monitoredProjects,
      deploys,
      deploysPrev,
      failedDeploys,
      failedDeploysPrev,
      uptimePercent,
      uptimePercentPrev,
      openIncidents: openIncidentsList.map((i) => ({
        name: i.project.name,
        reason: i.reason ?? i.type,
      })),
      slowestProject: slowest ? { name: slowest.projectName, p95Ms: slowest.p95Ms } : null,
      sslExpiring: sslRows
        .filter((row) => row.daysRemaining <= SSL_REPORT_THRESHOLD_DAYS)
        .sort((a, b) => a.daysRemaining - b.daysRemaining)
        .map((row) => ({ project: row.project, daysRemaining: row.daysRemaining })),
    };
  }

  formatDailyReport(data: DailyReportData): string {
    const healthy = data.openIncidents.length === 0;
    const header = healthy
      ? '✅ Todos os serviços operacionais'
      : `⚠️ ${data.openIncidents.length} incidente(s) aberto(s)`;

    const lines = [
      '📊 <b>RELATÓRIO DIÁRIO</b>',
      `<i>${formatDateTime(data.date, env.TZ)}</i>`,
      '',
      header,
      `Projetos monitorados: <b>${data.monitoredProjects}</b>`,
      '',
      '<b>Deploys (24h)</b>',
      `🚀 ${data.deploys} no total · ${deltaLabel(data.deploys, data.deploysPrev)}`,
      `❌ ${data.failedDeploys} com falha · ${deltaLabel(data.failedDeploys, data.failedDeploysPrev, true)}`,
      '',
      '<b>Disponibilidade (24h)</b>',
      `🔋 ${formatPercent(data.uptimePercent)} · ${uptimeDeltaLabel(data.uptimePercent, data.uptimePercentPrev)}`,
    ];

    if (data.slowestProject) {
      lines.push(
        '',
        '<b>Performance</b>',
        `🐢 Mais lento: ${escapeHtml(data.slowestProject.name)} (P95 ${formatMs(data.slowestProject.p95Ms)})`,
      );
    }

    if (data.openIncidents.length > 0) {
      lines.push('', '<b>⚠️ Incidentes abertos</b>');
      for (const incident of data.openIncidents.slice(0, 10)) {
        lines.push(`🔴 ${escapeHtml(incident.name)} — ${escapeHtml(incident.reason)}`);
      }
    }

    if (data.sslExpiring.length > 0) {
      lines.push('', '<b>🔐 SSL expirando (≤30 dias)</b>');
      for (const ssl of data.sslExpiring.slice(0, 10)) {
        lines.push(`• ${escapeHtml(ssl.project)}: ${ssl.daysRemaining} dia(s)`);
      }
    }

    return lines.join('\n');
  }

  async sendDailyReport(): Promise<void> {
    const data = await this.buildDailyReport();
    await this.notifier.send('DAILY_REPORT', this.formatDailyReport(data));

    // Gráfico de latência por projeto (24h), quando há métricas coletadas.
    const since = new Date(data.date.getTime() - DAY_MS);
    const stats = await this.performance.statsForAll(since);
    const chartUrl = latencyChartUrl(stats);
    if (chartUrl) {
      await this.notifier.sendPhoto(chartUrl, '⚡ Latência por projeto (24h)');
    }
  }

  async buildWeeklyReport(now = new Date()): Promise<WeeklyReportData> {
    const weekStart = new Date(now.getTime() - WEEK_MS);

    const [deploys, failedDeploys, incidents, downtimeMs, uptimePercent] = await Promise.all([
      this.deployments.countSince(weekStart),
      this.deployments.countByStateSince('ERROR', weekStart),
      this.incidents.listSince(weekStart),
      this.incidents.totalDowntimeMsSince(weekStart),
      this.uptime.globalUptimePercent(weekStart),
    ]);

    return {
      weekStart,
      weekEnd: now,
      deploys,
      failedDeploys,
      incidents: incidents.length,
      totalDowntimeMs: downtimeMs,
      uptimePercent,
    };
  }

  formatWeeklyReport(data: WeeklyReportData): string {
    return [
      '🗓️ <b>RELATÓRIO SEMANAL</b>',
      '',
      `Deploys realizados: <b>${data.deploys}</b>`,
      `Deploys com falha: <b>${data.failedDeploys}</b>`,
      `Incidentes detectados: <b>${data.incidents}</b>`,
      '',
      `Tempo total offline: <b>${formatDuration(data.totalDowntimeMs)}</b>`,
      `Disponibilidade: <b>${formatPercent(data.uptimePercent)}</b>`,
    ].join('\n');
  }

  async sendWeeklyReport(): Promise<void> {
    const data = await this.buildWeeklyReport();
    await this.notifier.send('WEEKLY_REPORT', this.formatWeeklyReport(data));
  }
}
