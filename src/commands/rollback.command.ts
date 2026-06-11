import { InlineKeyboard } from 'grammy';
import { escapeHtml } from '../utils/format';
import type { BotCommand } from './types';

export const rollbackCommand: BotCommand = {
  command: 'rollback',
  description: 'Reverte a produção de um projeto para o deploy anterior',
  handler: async (ctx, deps) => {
    const arg = ctx.match?.toString().trim();

    // Sem argumento: lista os projetos como botões para escolher.
    if (!arg) {
      const projects = await deps.projects.findAllActive();
      if (projects.length === 0) {
        await ctx.reply('Nenhum projeto ativo.');
        return;
      }
      const keyboard = new InlineKeyboard();
      projects.forEach((p, i) => {
        keyboard.text(p.name, `rollback:${p.id}`);
        if (i % 2 === 1) keyboard.row();
      });
      await ctx.reply('Selecione o projeto para reverter:', { reply_markup: keyboard });
      return;
    }

    const project = await deps.projects.findByName(arg);
    if (!project) {
      await ctx.reply(
        `Projeto "${escapeHtml(arg)}" não encontrado. Use /projects para ver a lista.`,
      );
      return;
    }

    const keyboard = new InlineKeyboard().text('✅ Confirmar rollback', `rollbackok:${project.id}`);
    await ctx.reply(
      `⚠️ Reverter a produção de <b>${escapeHtml(project.name)}</b> para o deploy anterior?`,
      { parse_mode: 'HTML', reply_markup: keyboard },
    );
  },
};
