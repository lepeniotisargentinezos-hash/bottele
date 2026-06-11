import type { Context } from 'grammy';
import type { Env } from '../config/env';
import type { Logger } from '../utils/logger';
import type {
  AnalyticsService,
  DeployActionsService,
  ExternalMonitorService,
  PerformanceService,
  ProjectDetailService,
  ProjectSyncService,
  ReportService,
  SettingsService,
  SslService,
  StatusService,
  UptimeService,
} from '../services';
import type {
  DeploymentRepository,
  IncidentRepository,
  ProjectRepository,
} from '../database/repositories';

export interface CommandDependencies {
  env: Env;
  logger: Logger;
  projects: ProjectRepository;
  deployments: DeploymentRepository;
  incidents: IncidentRepository;
  uptime: UptimeService;
  performance: PerformanceService;
  reports: ReportService;
  status: StatusService;
  settings: SettingsService;
  deployActions: DeployActionsService;
  ssl: SslService;
  externalMonitor: ExternalMonitorService;
  analytics: AnalyticsService;
  projectSync: ProjectSyncService;
  projectDetail: ProjectDetailService;
}

export interface BotCommand {
  command: string;
  description: string;
  handler: (ctx: Context, deps: CommandDependencies) => Promise<void>;
}
