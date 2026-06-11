import type { ProjectRepository } from '../database/repositories/project.repository';
import type { DeploymentRepository } from '../database/repositories/deployment.repository';
import type { IncidentRepository } from '../database/repositories/incident.repository';
import type { TelegramNotifier } from '../integrations/telegram/notifier';
import type { AnalyticsService } from './analytics.service';
import type { UptimeService } from './uptime.service';
import type { DailyReportData, WeeklyReportData } from '../types';
import {
  escapeHtml,
  formatDuration,
  formatGrowth,
  formatNumber,
  formatPercent,
} from '../utils/format';
import { growthPercent } from '../utils/stats';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** Monta e envia os relatórios diário e semanal. */
export class ReportService {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly deployments: DeploymentRepository,
    private readonly incidents: IncidentRepository,
    private readonly analytics: AnalyticsService,
    private readonly uptime: UptimeService,
    private readonly notifier: TelegramNotifier,
  ) {}

  async buildDailyReport(now = new Date()): Promise<DailyReportData> {
    const since = new Date(now.getTime() - DAY_MS);

    const [
      monitoredProjects,
      deploys,
      failedDeploys,
      uptimePercent,
      totals,
      topProjectName,
      openIncidents,
    ] = await Promise.all([
      this.projects.countActive(),
      this.deployments.countSince(since),
      this.deployments.countByStateSince('ERROR', since),
      this.uptime.globalUptimePercent(since),
      this.analytics.totalsBetween(since, now),
      this.analytics.topProjectName(since, now),
      this.incidents.countOpen(),
    ]);

    return {
      date: now,
      monitoredProjects,
      visitors: totals.visitors,
      pageViews: totals.pageViews,
      deploys,
      failedDeploys,
      uptimePercent,
      topProjectName,
      openIncidents,
    };
  }

  formatDailyReport(data: DailyReportData): string {
    const lines = [
      '📊 <b>RELATÓRIO DIÁRIO</b>',
      '',
      `Projetos monitorados: <b>${data.monitoredProjects}</b>`,
      '',
      `Visitantes:\n${formatNumber(data.visitors)}`,
      '',
      `Page Views:\n${formatNumber(data.pageViews)}`,
      '',
      `Deploys:\n${data.deploys}`,
      '',
      `Falhas:\n${data.failedDeploys}`,
      '',
      `Disponibilidade:\n${formatPercent(data.uptimePercent)}`,
    ];
    if (data.topProjectName) {
      lines.push('', `Top projeto:\n<b>${escapeHtml(data.topProjectName)}</b>`);
    }
    if (data.openIncidents > 0) {
      lines.push('', `⚠️ Incidentes abertos: <b>${data.openIncidents}</b>`);
    }
    return lines.join('\n');
  }

  async sendDailyReport(): Promise<void> {
    const data = await this.buildDailyReport();
    await this.notifier.send('DAILY_REPORT', this.formatDailyReport(data));
  }

  async buildWeeklyReport(now = new Date()): Promise<WeeklyReportData> {
    const weekStart = new Date(now.getTime() - WEEK_MS);
    const previousWeekStart = new Date(now.getTime() - 2 * WEEK_MS);

    const [
      currentTotals,
      previousTotals,
      deploys,
      failedDeploys,
      incidents,
      downtimeMs,
      uptimePercent,
    ] = await Promise.all([
      this.analytics.totalsBetween(weekStart, now),
      this.analytics.totalsBetween(previousWeekStart, weekStart),
      this.deployments.countSince(weekStart),
      this.deployments.countByStateSince('ERROR', weekStart),
      this.incidents.listSince(weekStart),
      this.incidents.totalDowntimeMsSince(weekStart),
      this.uptime.globalUptimePercent(weekStart),
    ]);

    return {
      weekStart,
      weekEnd: now,
      visitors: currentTotals.visitors,
      visitorsGrowth: growthPercent(currentTotals.visitors, previousTotals.visitors),
      pageViews: currentTotals.pageViews,
      pageViewsGrowth: growthPercent(currentTotals.pageViews, previousTotals.pageViews),
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
      `Visitantes: <b>${formatNumber(data.visitors)}</b> (${formatGrowth(data.visitorsGrowth)})`,
      `Page Views: <b>${formatNumber(data.pageViews)}</b> (${formatGrowth(data.pageViewsGrowth)})`,
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
