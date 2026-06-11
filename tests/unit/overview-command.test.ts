import { describe, expect, it, vi } from 'vitest';
import { overviewCommand } from '../../src/commands/overview.command';

function buildDeps() {
  return {
    projects: {
      findAllActive: vi.fn().mockResolvedValue([
        {
          id: 'p1',
          name: 'site-a',
          domains: ['site-a.com', 'a.vercel.app'],
          productionUrl: 'https://a.vercel.app',
        },
        { id: 'p2', name: 'site-b', domains: [], productionUrl: 'https://b.vercel.app' },
      ]),
    },
    uptime: {
      liveStatusAll: vi.fn().mockResolvedValue([
        {
          name: 'site-a',
          url: 'https://a.vercel.app',
          result: { success: true, statusCode: 200, responseTimeMs: 100 },
        },
        {
          name: 'site-b',
          url: 'https://b.vercel.app',
          result: { success: false, statusCode: 503, responseTimeMs: 50, reason: 'HTTP 503' },
        },
      ]),
    },
    analytics: {
      totalsByProject: vi
        .fn()
        .mockResolvedValue([{ projectId: 'p1', visitors: 50, pageViews: 120 }]),
      totals: vi.fn().mockResolvedValue({ visitors: 50, pageViews: 120 }),
    },
    incidents: { countOpen: vi.fn().mockResolvedValue(1) },
  };
}

describe('/overview', () => {
  it('monta o painel com resumo, status e visitantes', async () => {
    const deps = buildDeps();
    let message = '';
    const ctx = {
      replyWithChatAction: vi.fn(),
      reply: vi.fn().mockImplementation((t: string) => {
        message = t;
      }),
    };

    await overviewCommand.handler(ctx as never, deps as never);

    expect(message).toContain('OVERVIEW GERAL');
    expect(message).toContain('1/2 online');
    expect(message).toContain('50</b> visitantes');
    // Prefere domínio custom em vez do *.vercel.app.
    expect(message).toContain('site-a.com');
    expect(message).not.toContain('a.vercel.app');
    // Offline (site-b) antes do online (site-a), com o motivo destacado.
    expect(message.indexOf('site-b')).toBeLessThan(message.indexOf('site-a'));
    expect(message).toContain('⚠️ HTTP 503');
    expect(message).toContain('👥 50 · 120 views');
  });

  it('omite a linha de visitantes quando o site está no ar sem acessos', async () => {
    const deps = buildDeps();
    deps.analytics.totalsByProject.mockResolvedValue([]);
    deps.analytics.totals.mockResolvedValue({ visitors: 0, pageViews: 0 });
    let message = '';
    const ctx = {
      replyWithChatAction: vi.fn(),
      reply: vi.fn().mockImplementation((t: string) => {
        message = t;
      }),
    };

    await overviewCommand.handler(ctx as never, deps as never);
    expect(message).not.toContain('👥 0 · 0 views');
  });
});
