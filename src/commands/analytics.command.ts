import { escapeHtml, formatNumber } from '../utils/format';
import type { BotCommand } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export const analyticsCommand: BotCommand = {
  command: 'analytics',
  description: 'Métricas de analytics dos últimos 7 dias',
  handler: async (ctx, deps) => {
    const now = new Date();
    const from = new Date(now.getTime() - 7 * DAY_MS);

    const [totals, byProject] = await Promise.all([
      deps.analytics.totalsBetween(from, now),
      deps.analytics.totalsByProjectBetween(from, now),
    ]);

    if (totals.pageViews === 0 && byProject.length === 0) {
      await ctx.reply(
        'Sem dados de analytics. Verifique se o Web Analytics está habilitado nos projetos e disponível no seu plano Vercel.',
      );
      return;
    }

    const topProjects = byProject
      .slice(0, 5)
      .map(
        (entry, index) =>
          `${index + 1}. ${escapeHtml(entry.projectName)} — ${formatNumber(entry.pageViews)} views`,
      );

    await ctx.reply(
      [
        '📈 <b>Analytics — últimos 7 dias</b>',
        '',
        `Visitantes: <b>${formatNumber(totals.visitors)}</b>`,
        `Visitantes únicos: <b>${formatNumber(totals.uniqueVisitors)}</b>`,
        `Page views: <b>${formatNumber(totals.pageViews)}</b>`,
        '',
        '<b>Top projetos</b>',
        ...topProjects,
      ].join('\n'),
      { parse_mode: 'HTML' },
    );
  },
};
