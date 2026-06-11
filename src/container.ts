import { Bot } from 'grammy';
import type { PrismaClient } from '@prisma/client';
import { env } from './config/env';
import { logger } from './utils/logger';
import { createPrismaClient } from './database/client';
import {
  DeploymentRepository,
  IncidentRepository,
  MetricRepository,
  NotificationRepository,
  ProjectRepository,
  SettingsRepository,
  UserRepository,
} from './database/repositories';
import { VercelClient } from './integrations/vercel';
import { TelegramNotifier } from './integrations/telegram';
import {
  DeployActionsService,
  DeploymentLiveService,
  DeploymentMonitorService,
  FetchHttpChecker,
  PerformanceService,
  ProjectSyncService,
  ReportService,
  SettingsService,
  SslService,
  StatusService,
  TlsCertificateChecker,
  UptimeService,
} from './services';
import { buildJobs, type JobRegistry, type Scheduler } from './jobs';
import { createBot } from './bot';
import type { CommandDependencies } from './commands';

/**
 * Composition root: instancia e conecta todas as dependências.
 * Toda injeção de dependência acontece aqui — nenhuma classe
 * cria suas próprias dependências.
 */
export interface Container {
  prisma: PrismaClient;
  bot: Bot;
  registry: JobRegistry;
  scheduler: Scheduler;
  projectSync: ProjectSyncService;
  statusService: StatusService;
  deploymentLive: DeploymentLiveService;
}

export function buildContainer(): Container {
  const prisma = createPrismaClient();

  // Repositórios
  const projectRepository = new ProjectRepository(prisma);
  const deploymentRepository = new DeploymentRepository(prisma);
  const incidentRepository = new IncidentRepository(prisma);
  const metricRepository = new MetricRepository(prisma);
  const notificationRepository = new NotificationRepository(prisma);
  const settingsRepository = new SettingsRepository(prisma);
  const userRepository = new UserRepository(prisma);

  // Integrações
  const vercel = new VercelClient({
    token: env.VERCEL_TOKEN,
    teamId: env.VERCEL_TEAM_ID,
    logger,
  });

  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
  const notifier = new TelegramNotifier({
    api: bot.api,
    defaultChatId: env.CHAT_ID,
    notificationRepository,
    logger,
  });

  // Serviços
  const settingsService = new SettingsService(settingsRepository, env);
  const projectSync = new ProjectSyncService(
    vercel,
    projectRepository,
    notifier,
    settingsService,
    logger,
  );
  const deploymentMonitor = new DeploymentMonitorService(
    vercel,
    deploymentRepository,
    projectRepository,
    notifier,
    settingsService,
    logger,
  );
  const deploymentLive = new DeploymentLiveService(
    vercel,
    deploymentRepository,
    projectRepository,
    notifier,
    settingsService,
    logger,
  );
  const uptimeService = new UptimeService(
    projectRepository,
    metricRepository,
    incidentRepository,
    notifier,
    settingsService,
    new FetchHttpChecker(),
    env.HTTP_TIMEOUT_MS,
    logger,
  );
  const performanceService = new PerformanceService(
    projectRepository,
    metricRepository,
    incidentRepository,
    notifier,
    settingsService,
    logger,
  );
  const deployActions = new DeployActionsService(
    vercel,
    deploymentRepository,
    projectRepository,
    logger,
  );
  const sslService = new SslService(
    projectRepository,
    settingsRepository,
    notifier,
    new TlsCertificateChecker(),
    env.HTTP_TIMEOUT_MS,
    logger,
  );
  const reportService = new ReportService(
    projectRepository,
    deploymentRepository,
    incidentRepository,
    uptimeService,
    performanceService,
    sslService,
    notifier,
  );

  // Jobs
  const { registry, scheduler } = buildJobs({
    env,
    logger,
    projectSync,
    deploymentMonitor,
    uptime: uptimeService,
    performance: performanceService,
    reports: reportService,
    ssl: sslService,
    metricRepository,
  });

  const statusService = new StatusService(
    prisma,
    projectRepository,
    deploymentRepository,
    incidentRepository,
    uptimeService,
    vercel,
    registry,
  );

  // Bot com comandos
  const commandDependencies: CommandDependencies = {
    env,
    logger,
    projects: projectRepository,
    deployments: deploymentRepository,
    incidents: incidentRepository,
    uptime: uptimeService,
    performance: performanceService,
    reports: reportService,
    status: statusService,
    settings: settingsService,
    deployActions,
    ssl: sslService,
  };

  const configuredBot = createBot({
    bot,
    allowedChatId: env.CHAT_ID,
    users: userRepository,
    commandDependencies,
    logger,
  });

  return {
    prisma,
    bot: configuredBot,
    registry,
    scheduler,
    projectSync,
    statusService,
    deploymentLive,
  };
}
