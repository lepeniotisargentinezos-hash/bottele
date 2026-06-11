import { escapeHtml, formatNumber } from '../utils/format';
import type { BotCommand } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export const visitorsCommand: BotCommand = {
  command: 'visitors',
  description: 'Visitantes de hoje (ao vivo) por projeto',
  handler: async (ctx, deps) => {
    await ctx.replyWithChatAction('typing');

    // Consulta ao vivo na API da Vercel (números de hoje, até agora).
    const live = await deps.analytics.liveTotalsByProject();

    if (live.length > 0) {
      const lines = live.map(
        (entry) =>
          `• ${escapeHtml(entry.projectName)}: <b>${formatNumber(entry.visitors)}</b> visitantes · ${formatNumber(entry.pageViews)} views`,
      );
      await ctx.reply(['👥 <b>Visitantes de hoje — ao vivo</b>', '', ...lines].join('\n'), {
        parse_mode: 'HTML',
      });
      return;
    }

    // Fallback: histórico persistido dos últimos 7 dias.
    const now = new Date();
    const from = new Date(now.getTime() - 7 * DAY_MS);
    const byProject = await deps.analytics.totalsByProjectBetween(from, now);

    if (byProject.length === 0) {
      await ctx.reply(
        'Sem dados de visitantes — a API de Web Analytics da Vercel não retornou dados. ' +
          'Verifique se o Web Analytics está habilitado nos projetos (aba Analytics no dashboard da Vercel).',
      );
      return;
    }

    const lines = byProject.map(
      (entry) => `• ${escapeHtml(entry.projectName)}: <b>${formatNumber(entry.visitors)}</b>`,
    );

    await ctx.reply(
      [
        '👥 <b>Visitantes — últimos 7 dias</b> (histórico)',
        '<i>Consulta ao vivo indisponível; mostrando dados persistidos.</i>',
        '',
        ...lines,
      ].join('\n'),
      { parse_mode: 'HTML' },
    );
  },
};
