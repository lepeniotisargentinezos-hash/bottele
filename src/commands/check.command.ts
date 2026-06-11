import { escapeHtml } from '../utils/format';
import type { BotCommand } from './types';

const USAGE = [
  '🔧 <b>Configuração de monitoramento por projeto</b>',
  '',
  'Texto esperado na home (detecta páginas quebradas que respondem 200):',
  '<code>/check &lt;projeto&gt; text &lt;texto&gt;</code>',
  '<code>/check &lt;projeto&gt; text off</code> (remove)',
  '',
  'URL extra para monitorar além da home:',
  '<code>/check &lt;projeto&gt; url https://site/api/health</code>',
  '<code>/check &lt;projeto&gt; url clear</code> (remove todas)',
  '',
  'Ver configuração atual:',
  '<code>/check &lt;projeto&gt;</code>',
].join('\n');

export const checkCommand: BotCommand = {
  command: 'check',
  description: 'Configura texto esperado e URLs extras por projeto',
  handler: async (ctx, deps) => {
    const raw = ctx.match?.toString().trim() ?? '';
    if (!raw) {
      await ctx.reply(USAGE, { parse_mode: 'HTML' });
      return;
    }

    const [name, sub, ...rest] = raw.split(/\s+/);
    const value = rest.join(' ');
    const project = name ? await deps.projects.findByName(name) : null;
    if (!project) {
      await ctx.reply(`Projeto "${escapeHtml(name ?? '')}" não encontrado.`);
      return;
    }

    // Sem subcomando: mostra config atual.
    if (!sub) {
      const config = await deps.settings.getProjectCheck(project.id);
      await ctx.reply(
        [
          `🔧 <b>${escapeHtml(project.name)}</b>`,
          '',
          `Texto esperado: ${config.expectedText ? `<code>${escapeHtml(config.expectedText)}</code>` : '—'}`,
          `URLs extras: ${config.extraUrls.length > 0 ? config.extraUrls.map(escapeHtml).join(', ') : '—'}`,
        ].join('\n'),
        { parse_mode: 'HTML' },
      );
      return;
    }

    if (sub === 'text') {
      if (!value) {
        await ctx.reply('Informe o texto. Ex.: <code>/check projeto text Minha Loja</code>', {
          parse_mode: 'HTML',
        });
        return;
      }
      const expectedText = value === 'off' ? undefined : value;
      await deps.settings.updateProjectCheck(project.id, { expectedText });
      await ctx.reply(
        expectedText
          ? `✅ Texto esperado definido para <b>${escapeHtml(project.name)}</b>.`
          : `✅ Checagem de conteúdo removida de <b>${escapeHtml(project.name)}</b>.`,
        { parse_mode: 'HTML' },
      );
      return;
    }

    if (sub === 'url') {
      const config = await deps.settings.getProjectCheck(project.id);
      if (value === 'clear') {
        await deps.settings.updateProjectCheck(project.id, { extraUrls: [] });
        await ctx.reply(`✅ URLs extras removidas de <b>${escapeHtml(project.name)}</b>.`, {
          parse_mode: 'HTML',
        });
        return;
      }
      if (!/^https?:\/\//.test(value)) {
        await ctx.reply('URL inválida. Deve começar com http:// ou https://');
        return;
      }
      const extraUrls = [...new Set([...config.extraUrls, value])];
      await deps.settings.updateProjectCheck(project.id, { extraUrls });
      await ctx.reply(
        `✅ Monitorando ${extraUrls.length} URL(s) extra(s) em <b>${escapeHtml(project.name)}</b>.`,
        { parse_mode: 'HTML' },
      );
      return;
    }

    await ctx.reply(USAGE, { parse_mode: 'HTML' });
  },
};
