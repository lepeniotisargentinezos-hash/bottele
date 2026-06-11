import type { VercelClient } from '../integrations/vercel/client';
import type { ProjectRepository } from '../database/repositories/project.repository';
import type {
  AnalyticsRepository,
  AnalyticsTotals,
} from '../database/repositories/analytics.repository';
import { toErrorMessage } from '../utils/errors';
import type { Logger } from '../utils/logger';

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Coleta Web Analytics da Vercel (quando o plano/token permite)
 * e persiste snapshots diários por projeto. Degrada graciosamente
 * quando a API não está disponível.
 */
export class AnalyticsService {
  constructor(
    private readonly vercel: VercelClient,
    private readonly projects: ProjectRepository,
    private readonly analytics: AnalyticsRepository,
    private readonly logger: Logger,
  ) {}

  /** Coleta o snapshot do dia corrente (UTC) para todos os projetos ativos. */
  async collectDailySnapshots(): Promise<{ collected: number; unavailable: number }> {
    const projects = await this.projects.findAllActive();
    const today = startOfUtcDay(new Date());
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    let collected = 0;
    let unavailable = 0;

    for (const project of projects) {
      try {
        const stats = await this.vercel.getWebAnalytics(project.id, today, tomorrow);
        if (!stats) {
          unavailable++;
          continue;
        }

        await this.analytics.upsertSnapshot({
          projectId: project.id,
          date: today,
          visitors: stats.visitors,
          uniqueVisitors: stats.uniqueVisitors,
          pageViews: stats.pageViews,
          topPages: stats.topPages,
          countries: stats.countries,
          devices: stats.devices,
        });
        collected++;
      } catch (error) {
        this.logger.warn(
          { project: project.name, error: toErrorMessage(error) },
          'Falha ao coletar analytics do projeto',
        );
      }
    }

    this.logger.info({ collected, unavailable }, 'Coleta de analytics concluída');
    return { collected, unavailable };
  }

  totalsBetween(from: Date, to: Date): Promise<AnalyticsTotals> {
    return this.analytics.totalsBetween(from, to);
  }

  totalsByProjectBetween(from: Date, to: Date) {
    return this.analytics.totalsByProjectBetween(from, to);
  }

  async topProjectName(from: Date, to: Date): Promise<string | null> {
    const byProject = await this.analytics.totalsByProjectBetween(from, to);
    return byProject[0]?.projectName ?? null;
  }
}
