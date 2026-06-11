import { Bot } from 'grammy';
import type { PrismaClient } from '@prisma/client';
import { env } from './config/env';
import { logger } from './utils/logger';
import { escapeHtml, formatBRL, formatDateTime } from './utils/format';
import type { AnubisWebhookEvent } from './services';
import { createPrismaClient } from './database/client';
import {
  DeploymentRepository,
  IncidentRepository,
  MetricRepository,
  NotificationRepository,
  PageViewRepository,
  ProjectRepository,
  SaleRepository,
  SettingsRepository,
  UserRepository,
} from './database/repositories';
import { VercelClient } from './integrations/vercel';
import { TelegramNotifier } from './integrations/telegram';
import {
  AnalyticsService,
  DeployActionsService,
  DeploymentLiveService,
  DeploymentMonitorService,
  ExternalMonitorService,
  FetchHttpChecker,
  PerformanceService,
  ProjectDetailService,
  ProjectSyncService,
  ReportService,
  SalesService,
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
  analytics: AnalyticsService;
  anubisWebhook: (event: unknown) => Promise<void>;
}

export function buildContainer(): Container {
  const prisma = createPrismaClient();

  // Repositórios
  const projectRepository = new ProjectRepository(prisma);
  const deploymentRepository = new DeploymentRepository(prisma);
  const incidentRepository = new IncidentRepository(prisma);
  const metricRepository = new MetricRepository(prisma);
  const pageViewRepository = new PageViewRepository(prisma);
  const saleRepository = new SaleRepository(prisma);
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
  const externalMonitorService = new ExternalMonitorService(
    settingsService,
    settingsRepository,
    notifier,
    new FetchHttpChecker(),
    env.HTTP_TIMEOUT_MS,
    logger,
    env.MONITOR_TOKEN,
  );
  const analyticsService = new AnalyticsService(pageViewRepository, logger);
  const salesService = new SalesService(saleRepository, projectRepository, logger);
  const projectDetailService = new ProjectDetailService(
    vercel,
    projectRepository,
    deploymentRepository,
    incidentRepository,
    uptimeService,
    performanceService,
    analyticsService,
    externalMonitorService,
    sslService,
    salesService,
    logger,
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
    externalMonitor: externalMonitorService,
    metricRepository,
    pageViewRepository,
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
    externalMonitor: externalMonitorService,
    analytics: analyticsService,
    projectSync,
    projectDetail: projectDetailService,
    sales: salesService,
  };

  const configuredBot = createBot({
    bot,
    allowedChatId: env.CHAT_ID,
    users: userRepository,
    commandDependencies,
    logger,
  });

  // Processa um webhook de venda do AnubisPay: registra e alerta se confirmada.
  const anubisWebhook = async (event: unknown): Promise<void> => {
    const result = await salesService.ingest(event as AnubisWebhookEvent);
    if (!result.becamePaid) return;
    const alertSettings = await settingsService.getAlertSettings();
    if (!alertSettings.salesAlerts) return;

    // Busca a conta (gateway) usada pelo site, sem bloquear caso falhe.
    const account = result.site
      ? await externalMonitorService.accountForHost(result.site).catch(() => null)
      : null;

    const lines = [
      '💰 <b>VENDA CONFIRMADA</b>',
      '',
      `🌐 <b>${escapeHtml(result.projectName ?? result.site ?? 'n/d')}</b>`,
      result.stage ? `🏷️ ${escapeHtml(result.stage)}` : null,
      account ? `💳 Conta: ${escapeHtml(account)}` : null,
      `💵 <b>${formatBRL(result.amountCents)}</b>`,
      `🕐 ${formatDateTime(result.occurredAt, env.TZ)}`,
    ].filter((line): line is string => line !== null);

    await notifier.send('SYSTEM', lines.join('\n'));
  };

  return {
    prisma,
    bot: configuredBot,
    registry,
    scheduler,
    projectSync,
    statusService,
    deploymentLive,
    analytics: analyticsService,
    anubisWebhook,
  };
}
