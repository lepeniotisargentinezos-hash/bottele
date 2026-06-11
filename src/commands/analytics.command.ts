import { escapeHtml, formatNumber } from '../utils/format';
import type { TopEntry } from '../database/repositories/pageview.repository';
import type { BotCommand } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

function renderTop(title: string, entries: TopEntry[]): string[] {
  if (entries.length === 0) return [];
  return [
    '',
    `<b>${title}</b>`,
    ...entries.map((e) => `• ${escapeHtml(e.label)} — ${formatNumber(e.count)}`),
  ];
}

export const analyticsCommand: BotCommand = {
  command: 'analytics',
  description: 'Métricas de tráfego dos últimos 7 dias',
  handler: async (ctx, deps) => {
    const now = new Date();
    const from = new Date(now.getTime() - 7 * DAY_MS);

    const [totals, pages, countries, devices] = await Promise.all([
      deps.analytics.totals(from, now),
      deps.analytics.topPages(from, now, 5),
      deps.analytics.topCountries(from, now, 5),
      deps.analytics.topDevices(from, now, 5),
    ]);

    if (totals.pageViews === 0) {
      await ctx.reply(
        'Sem dados de analytics nos últimos 7 dias. Verifique o Web Analytics Drain na Vercel.',
      );
      return;
    }

    await ctx.reply(
      [
        '📈 <b>Analytics — últimos 7 dias</b>',
        '',
        `Visitantes: <b>${formatNumber(totals.visitors)}</b>`,
        `Page views: <b>${formatNumber(totals.pageViews)}</b>`,
        ...renderTop('Top páginas', pages),
        ...renderTop('Países', countries),
        ...renderTop('Dispositivos', devices),
      ].join('\n'),
      { parse_mode: 'HTML' },
    );
  },
};
