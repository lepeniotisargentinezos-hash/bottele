import type { BotCommand } from './types';

export const helpCommand: BotCommand = {
  command: 'help',
  description: 'Lista todos os comandos disponíveis',
  handler: async (ctx) => {
    await ctx.reply(
      [
        '📖 <b>Comandos disponíveis</b>',
        '',
        '/projects — Lista projetos e status atual',
        '/status — Visão geral da conta',
        '/deploys — Últimos deployments',
        '/errors — Falhas e incidentes recentes',
        '/performance — Latência média, P95 e P99 (24h)',
        '/uptime — Disponibilidade por projeto (24h)',
        '/report — Gera o relatório diário agora',
        '/health — Saúde interna do sistema',
      ].join('\n'),
      { parse_mode: 'HTML' },
    );
  },
};
