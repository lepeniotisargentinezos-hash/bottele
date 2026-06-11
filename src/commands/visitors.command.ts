import { escapeHtml, formatNumber } from '../utils/format';
import type { BotCommand } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export const visitorsCommand: BotCommand = {
  command: 'visitors',
  description: 'Visitantes por projeto nos últimos 7 dias',
  handler: async (ctx, deps) => {
    const now = new Date();
    const from = new Date(now.getTime() - 7 * DAY_MS);
    const byProject = await deps.analytics.totalsByProjectBetween(from, now);

    if (byProject.length === 0) {
      await ctx.reply('Sem dados de visitantes nos últimos 7 dias.');
      return;
    }

    const lines = byProject.map(
      (entry) => `• ${escapeHtml(entry.projectName)}: <b>${formatNumber(entry.visitors)}</b>`,
    );

    await ctx.reply(['👥 <b>Visitantes — últimos 7 dias</b>', '', ...lines].join('\n'), {
      parse_mode: 'HTML',
    });
  },
};
