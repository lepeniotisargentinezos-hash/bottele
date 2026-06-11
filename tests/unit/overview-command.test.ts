import { describe, expect, it, vi } from 'vitest';
import { overviewCommand } from '../../src/commands/overview.command';

function buildDeps() {
  return {
    projects: {
      findAllActive: vi.fn().mockResolvedValue([
        { id: 'p1', name: 'site-a', productionUrl: 'https://a.com' },
        { id: 'p2', name: 'site-b', productionUrl: 'https://b.com' },
      ]),
    },
    uptime: {
      liveStatusAll: vi.fn().mockResolvedValue([
        {
          name: 'site-a',
          url: 'https://a.com',
          result: { success: true, statusCode: 200, responseTimeMs: 100 },
        },
        {
          name: 'site-b',
          url: 'https://b.com',
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
    // Offline (site-b) deve aparecer antes do online (site-a).
    expect(message.indexOf('site-b')).toBeLessThan(message.indexOf('site-a'));
    expect(message).toContain('HTTP 503');
    expect(message).toContain('👥 50 · 120 views');
  });
});
