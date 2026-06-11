import { env } from './config/env';
import { logger } from './utils/logger';
import { buildContainer } from './container';
import { buildServer } from './server';
import { registerBotCommands } from './bot';
import { toErrorMessage } from './utils/errors';

async function main(): Promise<void> {
  logger.info({ nodeEnv: env.NODE_ENV }, 'Iniciando Vercel Telegram Monitor');

  const container = buildContainer();

  await container.prisma.$connect();
  logger.info('Conectado ao banco de dados');

  // Servidor HTTP de observabilidade (/health, /metrics)
  const server = await buildServer({
    statusService: container.statusService,
    logger,
  });
  await server.listen({ port: env.PORT, host: '0.0.0.0' });
  logger.info({ port: env.PORT }, 'Servidor HTTP no ar');

  // Sincronização inicial de projetos (sem alertar projetos pré-existentes no primeiro boot)
  try {
    const result = await container.projectSync.sync({ notifyNewProjects: false });
    logger.info(result, 'Sincronização inicial concluída');
  } catch (error) {
    logger.error(
      { error: toErrorMessage(error) },
      'Sincronização inicial falhou; jobs tentarão novamente',
    );
  }

  // Jobs agendados
  container.scheduler.start();

  // Bot Telegram (long polling)
  await registerBotCommands(container.bot);
  void container.bot.start({
    onStart: (botInfo) => logger.info({ username: botInfo.username }, 'Bot Telegram conectado'),
  });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Encerrando aplicação');
    try {
      await container.bot.stop();
      container.scheduler.stop();
      await server.close();
      await container.prisma.$disconnect();
      process.exit(0);
    } catch (error) {
      logger.error({ error: toErrorMessage(error) }, 'Erro durante shutdown');
      process.exit(1);
    }
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ error: toErrorMessage(reason) }, 'Unhandled rejection');
  });
  process.on('uncaughtException', (error) => {
    logger.fatal({ error: toErrorMessage(error) }, 'Uncaught exception; encerrando');
    process.exit(1);
  });
}

void main().catch((error) => {
  logger.fatal({ error: toErrorMessage(error) }, 'Falha fatal na inicialização');
  process.exit(1);
});
