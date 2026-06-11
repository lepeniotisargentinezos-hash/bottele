import type { BotCommand } from './types';

export const syncCommand: BotCommand = {
  command: 'sync',
  description: 'Força a sincronização de projetos/domínios com a Vercel',
  handler: async (ctx, deps) => {
    await ctx.replyWithChatAction('typing');

    // 1) Atualiza projetos e domínios a partir da Vercel.
    const result = await deps.projectSync.sync();
    // 2) Revalida disponibilidade para fechar incidentes já resolvidos.
    await deps.uptime.checkAll();

    await ctx.reply(
      [
        '🔄 <b>Sincronização concluída</b>',
        '',
        `Projetos: <b>${result.total}</b>`,
        result.created > 0 ? `Novos: ${result.created}` : null,
        result.deactivated > 0 ? `Desativados: ${result.deactivated}` : null,
        '',
        'Domínios atualizados e disponibilidade revalidada.',
      ]
        .filter((line): line is string => line !== null)
        .join('\n'),
      { parse_mode: 'HTML' },
    );
  },
};
