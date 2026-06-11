import type { Context, NextFunction } from 'grammy';
import type { UserRepository } from '../database/repositories/user.repository';
import type { Logger } from '../utils/logger';

export interface AuthMiddlewareOptions {
  allowedChatId: string;
  users: UserRepository;
  logger: Logger;
}

/**
 * Restringe o bot ao chat configurado em CHAT_ID (usuário ou grupo).
 * Também registra/atualiza o usuário no banco para auditoria.
 */
export function createAuthMiddleware(options: AuthMiddlewareOptions) {
  return async (ctx: Context, next: NextFunction): Promise<void> => {
    const chatId = ctx.chat?.id;
    const from = ctx.from;

    if (chatId === undefined || String(chatId) !== options.allowedChatId) {
      options.logger.warn({ chatId, userId: from?.id }, 'Acesso negado ao bot');
      if (chatId !== undefined) {
        await ctx.reply('⛔ Você não tem permissão para usar este bot.');
      }
      return;
    }

    if (from && !from.is_bot) {
      try {
        await options.users.upsertFromTelegram({
          telegramId: BigInt(from.id),
          chatId: BigInt(chatId),
          username: from.username ?? null,
          firstName: from.first_name ?? null,
        });
      } catch (error) {
        options.logger.warn({ error }, 'Falha ao registrar usuário');
      }
    }

    await next();
  };
}
