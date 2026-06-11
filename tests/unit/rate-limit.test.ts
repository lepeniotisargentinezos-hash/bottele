import { describe, expect, it, vi } from 'vitest';
import { createRateLimitMiddleware } from '../../src/middleware/rate-limit.middleware';

function createCtx(userId: number) {
  return {
    from: { id: userId },
    reply: vi.fn().mockResolvedValue(undefined),
  };
}

describe('rate limit middleware', () => {
  it('deixa passar mensagens dentro do limite', async () => {
    const middleware = createRateLimitMiddleware({ limit: 3, windowMs: 60_000 });
    const next = vi.fn();
    const ctx = createCtx(1);

    for (let i = 0; i < 3; i++) {
      await middleware(ctx as never, next);
    }
    expect(next).toHaveBeenCalledTimes(3);
  });

  it('bloqueia acima do limite e avisa uma única vez', async () => {
    const middleware = createRateLimitMiddleware({ limit: 2, windowMs: 60_000 });
    const next = vi.fn();
    const ctx = createCtx(1);

    for (let i = 0; i < 5; i++) {
      await middleware(ctx as never, next);
    }
    expect(next).toHaveBeenCalledTimes(2);
    expect(ctx.reply).toHaveBeenCalledTimes(1);
  });

  it('controla usuários de forma independente', async () => {
    const middleware = createRateLimitMiddleware({ limit: 1, windowMs: 60_000 });
    const next = vi.fn();

    await middleware(createCtx(1) as never, next);
    await middleware(createCtx(2) as never, next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('reseta a janela após o tempo configurado', async () => {
    vi.useFakeTimers();
    const middleware = createRateLimitMiddleware({ limit: 1, windowMs: 1000 });
    const next = vi.fn();
    const ctx = createCtx(1);

    await middleware(ctx as never, next);
    await middleware(ctx as never, next); // bloqueada
    vi.advanceTimersByTime(1100);
    await middleware(ctx as never, next); // nova janela

    expect(next).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
