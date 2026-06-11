import { formatDateTime, formatPercent } from '../utils/format';
import type { BotCommand } from './types';

export const statusCommand: BotCommand = {
  command: 'status',
  description: 'Visão geral da conta Vercel',
  handler: async (ctx, deps) => {
    const overview = await deps.status.accountOverview();

    await ctx.reply(
      [
        '📡 <b>Status da conta</b>',
        '',
        `Projetos ativos: <b>${overview.activeProjects}</b> (total: ${overview.totalProjects})`,
        `Incidentes abertos: <b>${overview.openIncidents}</b> ${overview.openIncidents > 0 ? '⚠️' : '✅'}`,
        '',
        '<b>Últimas 24h</b>',
        `Deploys: ${overview.deploysLast24h}`,
        `Deploys com falha: ${overview.failedDeploysLast24h}`,
        `Disponibilidade: ${formatPercent(overview.uptimePercent24h)}`,
        '',
        `Última sincronização: ${overview.lastSyncAt ? formatDateTime(overview.lastSyncAt, deps.env.TZ) : 'nunca'}`,
      ].join('\n'),
      { parse_mode: 'HTML' },
    );
  },
};
