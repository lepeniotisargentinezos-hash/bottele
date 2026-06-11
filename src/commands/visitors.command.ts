import { escapeHtml, formatNumber } from '../utils/format';
import type { BotCommand } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export const visitorsCommand: BotCommand = {
  command: 'visitors',
  description: 'Visitantes por projeto (hoje e 7 dias)',
  handler: async (ctx, deps) => {
    const now = new Date();
    const todayStart = new Date(now.getTime() - DAY_MS);
    const weekStart = new Date(now.getTime() - 7 * DAY_MS);

    const [today, week, projects] = await Promise.all([
      deps.analytics.totals(todayStart, now),
      deps.analytics.totals(weekStart, now),
      deps.projects.findAllActive(),
    ]);

    if (week.pageViews === 0) {
      await ctx.reply(
        'Ainda sem dados de visitantes. Confirme que o Web Analytics Drain está configurado na Vercel apontando para /drains/analytics.',
      );
      return;
    }

    const byProject = await deps.analytics.totalsByProject(weekStart, now);
    const nameById = new Map(projects.map((p) => [p.id, p.name]));
    const lines = byProject
      .slice(0, 15)
      .map(
        (entry) =>
          `• ${escapeHtml(nameById.get(entry.projectId) ?? entry.projectId)}: <b>${formatNumber(entry.visitors)}</b> visitantes · ${formatNumber(entry.pageViews)} views`,
      );

    await ctx.reply(
      [
        '👥 <b>Visitantes</b>',
        '',
        `<b>Hoje:</b> ${formatNumber(today.visitors)} visitantes · ${formatNumber(today.pageViews)} views`,
        `<b>7 dias:</b> ${formatNumber(week.visitors)} visitantes · ${formatNumber(week.pageViews)} views`,
        '',
        '<b>Por projeto (7 dias)</b>',
        ...lines,
      ].join('\n'),
      { parse_mode: 'HTML' },
    );
  },
};
