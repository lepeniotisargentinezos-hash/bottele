import { escapeHtml } from '../utils/format';
import type { BotCommand } from './types';

export const logsCommand: BotCommand = {
  command: 'logs',
  description: 'Logs de build do deploy mais recente de um projeto',
  handler: async (ctx, deps) => {
    const arg = ctx.match?.toString().trim();
    if (!arg) {
      await ctx.reply('Uso: <code>/logs nome-do-projeto</code>', { parse_mode: 'HTML' });
      return;
    }

    const project = await deps.projects.findByName(arg);
    if (!project) {
      await ctx.reply(
        `Projeto "${escapeHtml(arg)}" não encontrado. Use /projects para ver a lista.`,
      );
      return;
    }

    await ctx.replyWithChatAction('typing');
    const { logs } = await deps.deployActions.getLatestLogs(project.id);
    if (!logs) {
      await ctx.reply('Nenhum log disponível para o deploy mais recente deste projeto.');
      return;
    }

    await ctx.reply(
      `📜 <b>${escapeHtml(project.name)} — logs do último build</b>\n<pre>${escapeHtml(logs.slice(0, 3500))}</pre>`,
      { parse_mode: 'HTML' },
    );
  },
};
