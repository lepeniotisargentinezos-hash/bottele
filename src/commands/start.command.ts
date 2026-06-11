import type { BotCommand } from './types';

export const startCommand: BotCommand = {
  command: 'start',
  description: 'Inicia o bot e mostra uma visão geral',
  handler: async (ctx) => {
    await ctx.reply(
      [
        '👋 <b>Vercel Monitor Bot</b>',
        '',
        'Estou monitorando sua conta Vercel: deployments, disponibilidade, performance e analytics.',
        '',
        'Você receberá alertas automáticos de falhas de deploy, sites fora do ar e degradação de performance, além de relatórios diários e semanais.',
        '',
        'Use /help para ver todos os comandos.',
      ].join('\n'),
      { parse_mode: 'HTML' },
    );
  },
};
