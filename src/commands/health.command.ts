import { formatDateTime, formatDuration } from '../utils/format';
import type { BotCommand } from './types';

export const healthCommand: BotCommand = {
  command: 'health',
  description: 'Saúde interna do sistema de monitoramento',
  handler: async (ctx, deps) => {
    const health = await deps.status.health();

    const jobLines = health.jobs.map((job) => {
      const icon = job.lastError ? '🔴' : job.lastSuccessAt ? '🟢' : '⚪';
      const lastRun = job.lastRunAt
        ? formatDateTime(job.lastRunAt, deps.env.TZ)
        : 'nunca executado';
      return `${icon} <code>${job.name}</code> — ${lastRun} (${job.runs} exec., ${job.failures} falhas)`;
    });

    await ctx.reply(
      [
        `${health.status === 'ok' ? '💚' : '💛'} <b>Saúde do sistema: ${health.status.toUpperCase()}</b>`,
        '',
        `Uptime do bot: ${formatDuration(health.uptimeSeconds * 1000)}`,
        `Banco de dados: ${health.database ? '🟢 ok' : '🔴 indisponível'}`,
        `API Vercel: ${health.vercelApi ? '🟢 ok' : '🔴 indisponível'}`,
        '',
        '<b>Jobs</b>',
        ...jobLines,
      ].join('\n'),
      { parse_mode: 'HTML' },
    );
  },
};
