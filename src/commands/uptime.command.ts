import { escapeHtml, formatDuration, formatPercent } from '../utils/format';
import type { BotCommand } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export const uptimeCommand: BotCommand = {
  command: 'uptime',
  description: 'Disponibilidade por projeto nas últimas 24h',
  handler: async (ctx, deps) => {
    const since = new Date(Date.now() - DAY_MS);
    const projects = await deps.projects.findAllActive();

    const lines: string[] = [];
    for (const project of projects) {
      if (!project.productionUrl) continue;
      const stats = await deps.uptime.statsFor(project.id, project.name, since);
      if (stats.totalChecks === 0) continue;
      const icon = stats.uptimePercent >= 99.9 ? '🟢' : stats.uptimePercent >= 99 ? '🟡' : '🔴';
      lines.push(
        `${icon} ${escapeHtml(project.name)}: <b>${formatPercent(stats.uptimePercent)}</b> (${stats.totalChecks} checks)`,
      );
    }

    if (lines.length === 0) {
      await ctx.reply('Ainda não há checks de disponibilidade registrados.');
      return;
    }

    const [globalPercent, globalDowntimeMs] = await Promise.all([
      deps.uptime.globalUptimePercent(since),
      deps.uptime.globalDowntimeMs(since),
    ]);
    const downtime = formatDuration(globalDowntimeMs);

    // Certificados SSL expirando nos próximos 30 dias.
    const sslRows = await deps.ssl.statusForAll();
    const expiringSoon = sslRows
      .filter((row) => row.daysRemaining <= 30)
      .sort((a, b) => a.daysRemaining - b.daysRemaining);

    const sslLines =
      expiringSoon.length > 0
        ? [
            '',
            '🔐 <b>SSL expirando (≤30 dias)</b>',
            ...expiringSoon.map(
              (row) => `• ${escapeHtml(row.project)}: ${row.daysRemaining} dia(s)`,
            ),
          ]
        : [];

    await ctx.reply(
      [
        '🔋 <b>Disponibilidade — últimas 24h</b>',
        '',
        ...lines,
        '',
        `Global: <b>${formatPercent(globalPercent)}</b>`,
        `Tempo total offline: ${downtime}`,
        ...sslLines,
      ].join('\n'),
      { parse_mode: 'HTML' },
    );
  },
};
