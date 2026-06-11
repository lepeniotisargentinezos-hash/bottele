import type { PrismaClient } from '@prisma/client';
import type { ProjectRepository } from '../database/repositories/project.repository';
import type { DeploymentRepository } from '../database/repositories/deployment.repository';
import type { IncidentRepository } from '../database/repositories/incident.repository';
import type { VercelClient } from '../integrations/vercel/client';
import type { UptimeService } from './uptime.service';
import type { AccountOverview, JobStatus } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface HealthReport {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  database: boolean;
  vercelApi: boolean;
  jobs: JobStatus[];
}

export interface JobStatusProvider {
  list(): JobStatus[];
}

/** Visão geral da conta e healthcheck interno da aplicação. */
export class StatusService {
  private readonly startedAt = Date.now();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly projects: ProjectRepository,
    private readonly deployments: DeploymentRepository,
    private readonly incidents: IncidentRepository,
    private readonly uptime: UptimeService,
    private readonly vercel: VercelClient,
    private readonly jobStatusProvider: JobStatusProvider,
  ) {}

  async accountOverview(): Promise<AccountOverview> {
    const since = new Date(Date.now() - DAY_MS);
    const [
      totalProjects,
      activeProjects,
      openIncidents,
      deploys,
      failedDeploys,
      uptimePercent,
      lastSyncAt,
    ] = await Promise.all([
      this.projects.count(),
      this.projects.countActive(),
      this.incidents.countOpen(),
      this.deployments.countSince(since),
      this.deployments.countByStateSince('ERROR', since),
      this.uptime.globalUptimePercent(since),
      this.projects.lastSyncAt(),
    ]);

    return {
      totalProjects,
      activeProjects,
      openIncidents,
      deploysLast24h: deploys,
      failedDeploysLast24h: failedDeploys,
      uptimePercent24h: uptimePercent,
      lastSyncAt,
    };
  }

  /** Status por projeto para a página pública (/status). */
  async projectsStatus(): Promise<Array<{ name: string; up: boolean; uptimePercent: number }>> {
    const since = new Date(Date.now() - DAY_MS);
    const [projects, openIncidents] = await Promise.all([
      this.projects.findAllActive(),
      this.incidents.listOpen(),
    ]);
    const downProjectIds = new Set(
      openIncidents.filter((i) => i.type === 'DOWNTIME').map((i) => i.projectId),
    );

    const result: Array<{ name: string; up: boolean; uptimePercent: number }> = [];
    for (const project of projects) {
      const stats = await this.uptime.statsFor(project.id, project.name, since);
      result.push({
        name: project.name,
        up: !downProjectIds.has(project.id),
        uptimePercent: stats.uptimePercent,
      });
    }
    return result;
  }

  async health(): Promise<HealthReport> {
    const [database, vercelApi] = await Promise.all([this.checkDatabase(), this.vercel.ping()]);
    return {
      status: database && vercelApi ? 'ok' : 'degraded',
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      database,
      vercelApi,
      jobs: this.jobStatusProvider.list(),
    };
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
