import type { Env } from '../config/env';
import type { Logger } from '../utils/logger';
import type {
  DeploymentMonitorService,
  PerformanceService,
  ProjectSyncService,
  ReportService,
  UptimeService,
} from '../services';
import type { MetricRepository } from '../database/repositories/metric.repository';
import { JobRegistry } from './job-registry';
import { Scheduler } from './scheduler';

export { JobRegistry } from './job-registry';
export { Scheduler } from './scheduler';

export interface JobDependencies {
  env: Env;
  logger: Logger;
  projectSync: ProjectSyncService;
  deploymentMonitor: DeploymentMonitorService;
  uptime: UptimeService;
  performance: PerformanceService;
  reports: ReportService;
  metricRepository: MetricRepository;
}

const METRIC_RETENTION_DAYS = 90;

export function buildJobs(deps: JobDependencies): { registry: JobRegistry; scheduler: Scheduler } {
  const registry = new JobRegistry(deps.logger);
  const { env } = deps;

  registry.register('sync-projects', `*/${env.PROJECT_SYNC_INTERVAL_MINUTES} * * * *`, () =>
    deps.projectSync.sync().then(() => undefined),
  );

  registry.register('monitor-deployments', `*/${env.DEPLOY_POLL_INTERVAL_MINUTES} * * * *`, () =>
    deps.deploymentMonitor.checkAll(),
  );

  registry.register('uptime-check', `*/${env.CHECK_INTERVAL_MINUTES} * * * *`, () =>
    deps.uptime.checkAll(),
  );

  // Avaliação de performance logo após os checks de uptime alimentarem as métricas.
  registry.register('performance-evaluation', `*/${env.CHECK_INTERVAL_MINUTES} * * * *`, () =>
    deps.performance.evaluateThresholds(),
  );

  registry.register('daily-report', `0 ${env.REPORT_HOUR} * * *`, () =>
    deps.reports.sendDailyReport(),
  );

  registry.register('weekly-report', `0 ${env.REPORT_HOUR} * * 1`, () =>
    deps.reports.sendWeeklyReport(),
  );

  registry.register('prune-metrics', '30 3 * * *', async () => {
    const cutoff = new Date(Date.now() - METRIC_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    await deps.metricRepository.pruneOlderThan(cutoff);
  });

  const scheduler = new Scheduler(registry, env.TZ, deps.logger);
  return { registry, scheduler };
}
