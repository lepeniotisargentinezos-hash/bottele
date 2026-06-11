import { escapeHtml } from '../utils/format';
import type { BotCommand } from './types';

export const projectsCommand: BotCommand = {
  command: 'projects',
  description: 'Lista todos os projetos monitorados',
  handler: async (ctx, deps) => {
    const [projects, openIncidents] = await Promise.all([
      deps.projects.findAllActive(),
      deps.incidents.listOpen(),
    ]);

    if (projects.length === 0) {
      await ctx.reply('Nenhum projeto encontrado. A sincronização pode ainda estar em andamento.');
      return;
    }

    const projectsWithIncident = new Set(openIncidents.map((incident) => incident.projectId));

    const lines = projects.map((project) => {
      const icon = projectsWithIncident.has(project.id) ? '🔴' : '🟢';
      return `${icon} ${escapeHtml(project.name)}`;
    });

    await ctx.reply(
      [`📦 <b>Projetos monitorados (${projects.length})</b>`, '', ...lines].join('\n'),
      { parse_mode: 'HTML' },
    );
  },
};
