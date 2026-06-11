import type { VercelClient } from '../integrations/vercel/client';
import type { ProjectRepository } from '../database/repositories/project.repository';
import type { TelegramNotifier } from '../integrations/telegram/notifier';
import type { SettingsService } from './settings.service';
import { escapeHtml } from '../utils/format';
import type { Logger } from '../utils/logger';

export interface ProjectSyncResult {
  total: number;
  created: number;
  deactivated: number;
}

/**
 * Descoberta automática de projetos: busca tudo da API da Vercel,
 * persiste no banco e avisa quando um projeto novo aparece.
 */
export class ProjectSyncService {
  constructor(
    private readonly vercel: VercelClient,
    private readonly projects: ProjectRepository,
    private readonly notifier: TelegramNotifier,
    private readonly settings: SettingsService,
    private readonly logger: Logger,
  ) {}

  async sync(options: { notifyNewProjects?: boolean } = {}): Promise<ProjectSyncResult> {
    const notifyNewProjects = options.notifyNewProjects ?? true;
    const vercelProjects = await this.vercel.listAllProjects();
    const alertSettings = await this.settings.getAlertSettings();

    let created = 0;
    for (const vercelProject of vercelProjects) {
      const productionAliases = vercelProject.targets?.production?.alias ?? [];
      const productionUrl = productionAliases[0] ? `https://${productionAliases[0]}` : null;

      let domains = productionAliases;
      if (domains.length === 0) {
        try {
          domains = await this.vercel.listProjectDomains(vercelProject.id);
        } catch {
          domains = [];
        }
      }

      const { project, isNew } = await this.projects.upsert({
        id: vercelProject.id,
        name: vercelProject.name,
        framework: vercelProject.framework,
        productionUrl: productionUrl ?? (domains[0] ? `https://${domains[0]}` : null),
        domains,
      });

      if (isNew) {
        created++;
        this.logger.info({ project: project.name }, 'Novo projeto detectado');
        if (notifyNewProjects && alertSettings.newProjects) {
          await this.notifier.send(
            'NEW_PROJECT',
            [
              '🆕 <b>NOVO PROJETO DETECTADO</b>',
              '',
              `Projeto: <b>${escapeHtml(project.name)}</b>`,
              `Framework: ${escapeHtml(project.framework ?? 'n/d')}`,
              project.productionUrl ? `URL: ${escapeHtml(project.productionUrl)}` : null,
            ]
              .filter((line): line is string => line !== null)
              .join('\n'),
            { payload: { projectId: project.id } },
          );
        }
      }
    }

    const deactivated = await this.projects.deactivateMissing(vercelProjects.map((p) => p.id));
    this.logger.info(
      { total: vercelProjects.length, created, deactivated },
      'Sincronização de projetos concluída',
    );

    return { total: vercelProjects.length, created, deactivated };
  }
}
