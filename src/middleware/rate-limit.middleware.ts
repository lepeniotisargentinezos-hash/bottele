import type { Context, NextFunction } from 'grammy';

export interface RateLimitOptions {
  /** Máximo de mensagens permitidas dentro da janela. */
  limit: number;
  /** Janela em milissegundos. */
  windowMs: number;
}

interface WindowState {
  count: number;
  windowStart: number;
}

/**
 * Rate limiting em memória por usuário (janela fixa).
 * Suficiente para um bot de uso pessoal/equipe; para múltiplas
 * instâncias, trocar por um armazenamento compartilhado (Redis).
 */
export function createRateLimitMiddleware(
  options: RateLimitOptions = { limit: 20, windowMs: 60_000 },
) {
  const windows = new Map<number, WindowState>();

  return async (ctx: Context, next: NextFunction): Promise<void> => {
    const userId = ctx.from?.id;
    if (userId === undefined) {
      await next();
      return;
    }

    const now = Date.now();
    const state = windows.get(userId);

    if (!state || now - state.windowStart >= options.windowMs) {
      windows.set(userId, { count: 1, windowStart: now });
      await next();
      return;
    }

    state.count++;
    if (state.count > options.limit) {
      if (state.count === options.limit + 1) {
        await ctx.reply('⏳ Muitas mensagens. Aguarde um momento antes de tentar novamente.');
      }
      return;
    }

    await next();
  };
}
