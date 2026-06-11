import type { DeploymentState } from '@prisma/client';
import type { VercelClient } from '../integrations/vercel/client';
import type { ProjectRepository } from '../database/repositories/project.repository';
import type { DeploymentRepository } from '../database/repositories/deployment.repository';
import type { IncidentRepository } from '../database/repositories/incident.repository';
import type { UptimeService } from './uptime.service';
import type { PerformanceService } from './performance.service';
import type { AnalyticsService } from './analytics.service';
import type { ExternalMonitorService } from './external-monitor.service';
import type { SslService } from './ssl.service';
import type { TopEntry } from '../database/repositories/pageview.repository';
import { toErrorMessage } from '../utils/errors';
import type { Logger } from '../utils/logger';

const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeHost(host: string): string {
  return host
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
}

export interface ProjectDetail {
  id: string;
  name: string;
  domain: string;
  productionUrl: string | null;
  online: boolean | null;
  statusDetail: string;
  responseTimeMs: number | null;
  gateway: { ok: boolean; account: string | null } | null;
  sslDaysRemaining: number | null;
  visitorsToday: number;
  pageViewsToday: number;
  visitors7d: number;
  pageViews7d: number;
  topPages: TopEntry[];
  recentDeploys: Array<{ state: DeploymentState; branch: string | null; createdAt: Date }>;
  openIncidents: string[];
  envKeys: string[];
}

/** Agrega, sob demanda, todos os dados de um projeto para o card interativo. */
export class ProjectDetailService {
  constructor(
    private readonly vercel: VercelClient,
    private readonly projects: ProjectRepository,
    private readonly deployments: DeploymentRepository,
    private readonly incidents: IncidentRepository,
    private readonly uptime: UptimeService,
    private readonly performance: PerformanceService,
    private readonly analytics: AnalyticsService,
    private readonly externalMonitor: ExternalMonitorService,
    private readonly ssl: SslService,
    private readonly logger: Logger,
  ) {}

  private displayDomain(project: {
    name: string;
    domains: string[];
    productionUrl: string | null;
  }): string {
    const custom = project.domains.find((d) => !d.endsWith('.vercel.app'));
    if (custom) return custom;
    if (project.name.includes('.')) return project.name;
    return project.productionUrl ? normalizeHost(project.productionUrl) : project.name;
  }

  async build(projectId: string): Promise<ProjectDetail | null> {
    const project = await this.projects.findById(projectId);
    if (!project) return null;

    const now = new Date();
    const todayStart = new Date(now.getTime() - DAY_MS);
    const weekStart = new Date(now.getTime() - 7 * DAY_MS);
    const domain = this.displayDomain(project);

    const [
      statusResults,
      gateways,
      sslRows,
      today,
      week,
      topPages,
      recent,
      openIncidents,
      envKeys,
    ] = await Promise.all([
      this.uptime.recheckProject(projectId),
      this.externalMonitor.inspect(),
      this.ssl.statusForAll(),
      this.analytics.totals(todayStart, now, projectId),
      this.analytics.totals(weekStart, now, projectId),
      this.analytics.topPages(weekStart, now, 5, projectId),
      this.deployments.findRecentByProject(projectId, 5),
      this.incidents.listOpen(),
      this.vercel.listProjectEnvKeys(projectId).catch((error) => {
        this.logger.warn({ projectId, error: toErrorMessage(error) }, 'Falha ao listar env keys');
        return [] as string[];
      }),
    ]);

    const primary = statusResults[0] ?? null;
    const online = primary ? primary.success : null;
    const statusDetail = !primary
      ? 'sem URL monitorável'
      : primary.success
        ? 'no ar'
        : (primary.reason ?? `HTTP ${primary.statusCode ?? '?'}`);

    const candidates = [domain, project.name, ...project.domains]
      .filter(Boolean)
      .map(normalizeHost);
    const gatewayMatch = gateways.find((g) => candidates.includes(g.host));
    const sslMatch = sslRows.find((s) => candidates.includes(normalizeHost(s.hostname)));

    return {
      id: project.id,
      name: project.name,
      domain,
      productionUrl: project.productionUrl,
      online,
      statusDetail,
      responseTimeMs: primary && primary.success ? primary.responseTimeMs : null,
      gateway: gatewayMatch ? { ok: gatewayMatch.ok, account: gatewayMatch.account } : null,
      sslDaysRemaining: sslMatch ? sslMatch.daysRemaining : null,
      visitorsToday: today.visitors,
      pageViewsToday: today.pageViews,
      visitors7d: week.visitors,
      pageViews7d: week.pageViews,
      topPages,
      recentDeploys: recent.map((d) => ({
        state: d.state,
        branch: d.branch,
        createdAt: d.vercelCreatedAt,
      })),
      openIncidents: openIncidents
        .filter((i) => i.projectId === projectId)
        .map((i) => i.reason ?? i.type),
      envKeys,
    };
  }
}
