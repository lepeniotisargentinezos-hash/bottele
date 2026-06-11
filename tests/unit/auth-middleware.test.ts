import { describe, expect, it, vi } from 'vitest';
import { createAuthMiddleware } from '../../src/middleware/auth.middleware';
import { logger } from '../../src/utils/logger';

function buildMiddleware() {
  const users = { upsertFromTelegram: vi.fn().mockResolvedValue({}) };
  const middleware = createAuthMiddleware({
    allowedChatId: '123456789',
    users: users as never,
    logger,
  });
  return { middleware, users };
}

function createCtx(chatId: number | undefined, userId = 42) {
  return {
    chat: chatId === undefined ? undefined : { id: chatId },
    from: { id: userId, is_bot: false, first_name: 'Vinicios', username: 'vinicios' },
    reply: vi.fn().mockResolvedValue(undefined),
  };
}

describe('auth middleware', () => {
  it('permite o chat autorizado e registra o usuário', async () => {
    const { middleware, users } = buildMiddleware();
    const next = vi.fn();
    const ctx = createCtx(123456789);

    await middleware(ctx as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(users.upsertFromTelegram).toHaveBeenCalledWith(
      expect.objectContaining({ telegramId: 42n, chatId: 123456789n, username: 'vinicios' }),
    );
  });

  it('bloqueia chats não autorizados', async () => {
    const { middleware } = buildMiddleware();
    const next = vi.fn();
    const ctx = createCtx(999);

    await middleware(ctx as never, next);

    expect(next).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('permissão'));
  });

  it('ignora updates sem chat', async () => {
    const { middleware } = buildMiddleware();
    const next = vi.fn();
    const ctx = createCtx(undefined);

    await middleware(ctx as never, next);

    expect(next).not.toHaveBeenCalled();
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('segue mesmo se o registro do usuário falhar', async () => {
    const { middleware, users } = buildMiddleware();
    users.upsertFromTelegram.mockRejectedValue(new Error('db down'));
    const next = vi.fn();

    await middleware(createCtx(123456789) as never, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
