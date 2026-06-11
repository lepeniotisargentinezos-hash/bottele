import { escapeHtml, formatMs } from '../utils/format';
import type { BotCommand } from './types';

const USAGE = [
  '🔌 <b>Monitoramento de serviços externos</b>',
  '',
  'Monitore gateways de pagamento, APIs de terceiros, etc.',
  '',
  '<code>/monitor</code> — status ao vivo dos serviços',
  '<code>/monitor add &lt;nome&gt; &lt;url&gt;</code> — adiciona',
  '<code>/monitor remove &lt;nome&gt;</code> — remove',
  '',
  'Ex.: <code>/monitor add anubispay https://api.anubispay.com/v1</code>',
].join('\n');

export const monitorCommand: BotCommand = {
  command: 'monitor',
  description: 'Monitora serviços externos (gateways, APIs)',
  handler: async (ctx, deps) => {
    const raw = ctx.match?.toString().trim() ?? '';
    const [sub, name, url] = raw.split(/\s+/);

    if (sub === 'add') {
      if (!name || !url || !/^https?:\/\//.test(url)) {
        await ctx.reply('Uso: <code>/monitor add nome https://url</code>', { parse_mode: 'HTML' });
        return;
      }
      await deps.settings.addExternalMonitor(name, url);
      await ctx.reply(`✅ Monitorando <b>${escapeHtml(name)}</b>.`, { parse_mode: 'HTML' });
      return;
    }

    if (sub === 'remove') {
      if (!name) {
        await ctx.reply('Uso: <code>/monitor remove nome</code>', { parse_mode: 'HTML' });
        return;
      }
      await deps.settings.removeExternalMonitor(name);
      await ctx.reply(`✅ <b>${escapeHtml(name)}</b> removido do monitoramento.`, {
        parse_mode: 'HTML',
      });
      return;
    }

    // Sem subcomando: status ao vivo.
    const monitors = await deps.settings.getExternalMonitors();
    if (monitors.length === 0) {
      await ctx.reply(USAGE, { parse_mode: 'HTML' });
      return;
    }

    await ctx.replyWithChatAction('typing');
    const statuses = await deps.externalMonitor.liveStatus();
    const lines = statuses.map((s) => {
      const icon = s.result.success ? '🟢' : '🔴';
      const detail = s.result.success
        ? `${s.result.statusCode ?? 'ok'} · ${formatMs(s.result.responseTimeMs)}`
        : (s.result.reason ?? 'sem resposta');
      return `${icon} <b>${escapeHtml(s.name)}</b> — ${escapeHtml(String(detail))}`;
    });

    await ctx.reply(['🔌 <b>Serviços externos</b>', '', ...lines].join('\n'), {
      parse_mode: 'HTML',
    });
  },
};
