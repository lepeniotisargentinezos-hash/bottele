import { escapeHtml, formatDateTime, shortSha } from '../utils/format';
import type { BotCommand } from './types';

const STATE_ICONS: Record<string, string> = {
  READY: '✅',
  ERROR: '❌',
  CANCELED: '⚠️',
  BUILDING: '🔨',
  INITIALIZING: '⏳',
  QUEUED: '🕐',
};

export const deploysCommand: BotCommand = {
  command: 'deploys',
  description: 'Mostra os últimos deployments',
  handler: async (ctx, deps) => {
    const deployments = await deps.deployments.findRecent(10);

    if (deployments.length === 0) {
      await ctx.reply('Nenhum deployment registrado ainda.');
      return;
    }

    const lines = deployments.map((deployment) => {
      const icon = STATE_ICONS[deployment.state] ?? '❔';
      const branch = deployment.branch ? ` (${escapeHtml(deployment.branch)})` : '';
      return [
        `${icon} <b>${escapeHtml(deployment.project.name)}</b>${branch}`,
        `   <code>${escapeHtml(shortSha(deployment.commitSha))}</code> — ${formatDateTime(deployment.vercelCreatedAt, deps.env.TZ)}`,
      ].join('\n');
    });

    await ctx.reply(['🚀 <b>Últimos deployments</b>', '', ...lines].join('\n'), {
      parse_mode: 'HTML',
    });
  },
};
