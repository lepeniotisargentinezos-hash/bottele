import { escapeHtml, formatMs } from '../utils/format';
import type { BotCommand } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export const performanceCommand: BotCommand = {
  command: 'performance',
  description: 'Latência média, P95 e P99 das últimas 24h',
  handler: async (ctx, deps) => {
    const since = new Date(Date.now() - DAY_MS);
    const allStats = await deps.performance.statsForAll(since);

    if (allStats.length === 0) {
      await ctx.reply('Ainda não há métricas de performance coletadas.');
      return;
    }

    const lines = allStats.map((stats) =>
      [
        `<b>${escapeHtml(stats.projectName)}</b>`,
        `   média ${formatMs(stats.avgMs)} · P95 ${formatMs(stats.p95Ms)} · P99 ${formatMs(stats.p99Ms)} (${stats.samples} amostras)`,
      ].join('\n'),
    );

    await ctx.reply(['⚡ <b>Performance — últimas 24h</b>', '', ...lines].join('\n'), {
      parse_mode: 'HTML',
    });
  },
};
