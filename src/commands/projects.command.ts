import { escapeHtml, formatMs } from '../utils/format';
import type { BotCommand } from './types';

/** Remove o esquema da URL para uma exibição mais enxuta. */
function shortUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

export const projectsCommand: BotCommand = {
  command: 'projects',
  description: 'Lista os projetos com status ao vivo (no ar / fora do ar)',
  handler: async (ctx, deps) => {
    await ctx.replyWithChatAction('typing');
    const statuses = await deps.uptime.liveStatusAll();

    if (statuses.length === 0) {
      await ctx.reply(
        'Nenhum projeto com URL de produção monitorável. A sincronização pode ainda estar em andamento.',
      );
      return;
    }

    const up = statuses.filter((s) => s.result.success);
    const down = statuses.filter((s) => !s.result.success);

    const lines: string[] = [
      `📦 <b>Status dos projetos</b> — ${up.length}/${statuses.length} no ar`,
    ];

    if (down.length > 0) {
      lines.push('', `🔴 <b>Fora do ar (${down.length})</b>`);
      for (const item of down) {
        const reason = item.result.statusCode
          ? `HTTP ${item.result.statusCode}`
          : (item.result.reason ?? 'sem resposta');
        lines.push(
          `🔴 <b>${escapeHtml(item.name)}</b>`,
          `   ${escapeHtml(shortUrl(item.url))} — ${escapeHtml(reason)}`,
        );
      }
    }

    if (up.length > 0) {
      lines.push('', `🟢 <b>No ar (${up.length})</b>`);
      for (const item of up) {
        lines.push(
          `🟢 ${escapeHtml(item.name)} — ${escapeHtml(shortUrl(item.url))} (${formatMs(item.result.responseTimeMs)})`,
        );
      }
    }

    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  },
};
