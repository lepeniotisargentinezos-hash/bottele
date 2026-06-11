import type { BotCommand } from './types';

export const reportCommand: BotCommand = {
  command: 'report',
  description: 'Gera o relatório diário sob demanda',
  handler: async (ctx, deps) => {
    const data = await deps.reports.buildDailyReport();
    await ctx.reply(deps.reports.formatDailyReport(data), { parse_mode: 'HTML' });
  },
};
