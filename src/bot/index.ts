import { Bot, type Context } from 'grammy';
import { allCommands, type CommandDependencies } from '../commands';
import { createAuthMiddleware, createRateLimitMiddleware } from '../middleware';
import { registerCallbacks } from './callbacks';
import type { UserRepository } from '../database/repositories/user.repository';
import { toErrorMessage } from '../utils/errors';
import type { Logger } from '../utils/logger';

export interface CreateBotOptions {
  bot: Bot;
  allowedChatId: string;
  users: UserRepository;
  commandDependencies: CommandDependencies;
  logger: Logger;
}

/** Configura o bot grammY com middleware de segurança e todos os comandos registrados. */
export function createBot(options: CreateBotOptions): Bot {
  const { bot, logger } = options;

  bot.use(createRateLimitMiddleware());
  bot.use(
    createAuthMiddleware({
      allowedChatId: options.allowedChatId,
      users: options.users,
      logger,
    }),
  );

  for (const command of allCommands) {
    bot.command(command.command, async (ctx: Context) => {
      try {
        await command.handler(ctx, options.commandDependencies);
      } catch (error) {
        logger.error(
          { command: command.command, error: toErrorMessage(error) },
          'Erro ao executar comando',
        );
        await ctx
          .reply('❌ Ocorreu um erro ao processar o comando. Tente novamente em instantes.')
          .catch(() => undefined);
      }
    });
  }

  // Botões inline (redeploy, logs, rollback, recheck, settings).
  registerCallbacks(bot, options.commandDependencies);

  // Tratamento global de erros do bot (updates malformados, falhas de rede etc.).
  bot.catch((error) => {
    logger.error({ error: toErrorMessage(error.error) }, 'Erro não tratado no bot');
  });

  return bot;
}

export async function registerBotCommands(bot: Bot): Promise<void> {
  await bot.api.setMyCommands(
    allCommands.map((command) => ({
      command: command.command,
      description: command.description,
    })),
  );
}
