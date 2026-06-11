import { escapeHtml, formatDateTime } from '../utils/format';
import type { BotCommand } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export const errorsCommand: BotCommand = {
  command: 'errors',
  description: 'Falhas de deploy e incidentes recentes',
  handler: async (ctx, deps) => {
    const since = new Date(Date.now() - 7 * DAY_MS);
    const [failures, openIncidents] = await Promise.all([
      deps.deployments.findRecentFailures(since, 10),
      deps.incidents.listOpen(),
    ]);

    const sections: string[] = ['🚨 <b>Erros recentes (7 dias)</b>'];

    sections.push('', '<b>Incidentes abertos</b>');
    if (openIncidents.length === 0) {
      sections.push('Nenhum incidente aberto ✅');
    } else {
      for (const incident of openIncidents) {
        sections.push(
          `🔴 ${escapeHtml(incident.project.name)} — ${escapeHtml(incident.reason ?? incident.type)} (desde ${formatDateTime(incident.startedAt, deps.env.TZ)})`,
        );
      }
    }

    sections.push('', '<b>Deploys com falha</b>');
    if (failures.length === 0) {
      sections.push('Nenhuma falha de deploy ✅');
    } else {
      for (const failure of failures) {
        sections.push(
          `❌ ${escapeHtml(failure.project.name)} — ${escapeHtml(failure.branch ?? 'n/d')} em ${formatDateTime(failure.vercelCreatedAt, deps.env.TZ)}`,
        );
      }
    }

    await ctx.reply(sections.join('\n'), { parse_mode: 'HTML' });
  },
};
