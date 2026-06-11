import type { BotCommand } from './types';

export const helpCommand: BotCommand = {
  command: 'help',
  description: 'Lista todos os comandos disponíveis',
  handler: async (ctx) => {
    await ctx.reply(
      [
        '📖 <b>Comandos disponíveis</b>',
        '',
        '/overview — Painel geral: status, domínios e visitantes',
        '/painel — Menu interativo: clique num domínio e veja tudo dele',
        '/projects — Lista projetos e status atual',
        '/status — Visão geral da conta',
        '/deploys — Últimos deployments',
        '/errors — Falhas e incidentes recentes',
        '/analytics — Tráfego: visitantes, top páginas, países (7 dias)',
        '/visitors — Visitantes por projeto (hoje e 7 dias)',
        '/performance — Latência média, P95 e P99 (24h)',
        '/uptime — Disponibilidade e SSL por projeto',
        '/report — Gera o relatório diário agora',
        '/health — Saúde interna do sistema',
        '',
        '<b>Operação</b>',
        '/rollback [projeto] — Reverte para o deploy anterior',
        '/logs &lt;projeto&gt; — Logs do último build',
        '/check &lt;projeto&gt; — Texto esperado e URLs extras',
        '/monitor — Monitora serviços externos (gateways, APIs)',
        '/sync — Sincroniza projetos/domínios com a Vercel agora',
        '/settings — Ajusta alertas e thresholds',
      ].join('\n'),
      { parse_mode: 'HTML' },
    );
  },
};
