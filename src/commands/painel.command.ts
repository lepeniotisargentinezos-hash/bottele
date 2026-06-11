import { buildPanelMenu } from '../bot/project-detail-view';
import type { BotCommand } from './types';

export const painelCommand: BotCommand = {
  command: 'painel',
  description: 'Menu interativo: escolha um domínio e veja todos os dados',
  handler: async (ctx, deps) => {
    const projects = await deps.projects.findAllActive();
    if (projects.length === 0) {
      await ctx.reply('Nenhum projeto ativo ainda.');
      return;
    }
    const { text, keyboard } = buildPanelMenu(projects);
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  },
};
