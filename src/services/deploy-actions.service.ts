import type { VercelClient } from '../integrations/vercel/client';
import type { DeploymentRepository } from '../database/repositories/deployment.repository';
import type { ProjectRepository } from '../database/repositories/project.repository';
import { toErrorMessage } from '../utils/errors';
import type { Logger } from '../utils/logger';

export interface ActionResult {
  ok: boolean;
  message: string;
}

/**
 * Ações operacionais sobre deployments — redeploy, rollback e logs —
 * acionadas pelos botões inline e pelos comandos /rollback e /logs.
 */
export class DeployActionsService {
  constructor(
    private readonly vercel: VercelClient,
    private readonly deployments: DeploymentRepository,
    private readonly projects: ProjectRepository,
    private readonly logger: Logger,
  ) {}

  async redeploy(deploymentId: string): Promise<ActionResult> {
    const deployment = await this.deployments.findById(deploymentId);
    if (!deployment) return { ok: false, message: 'Deployment não encontrado no histórico.' };

    const project = await this.projects.findById(deployment.projectId);
    if (!project) return { ok: false, message: 'Projeto não encontrado.' };

    try {
      const result = await this.vercel.redeploy(
        project.name,
        deploymentId,
        deployment.target ?? 'production',
      );
      this.logger.info({ deploymentId, newId: result.uid }, 'Redeploy disparado');
      return {
        ok: true,
        message: `🔄 Redeploy disparado para <b>${project.name}</b>. Acompanhe pelos alertas.`,
      };
    } catch (error) {
      this.logger.error({ deploymentId, error: toErrorMessage(error) }, 'Falha no redeploy');
      return { ok: false, message: `Falha ao disparar redeploy: ${toErrorMessage(error)}` };
    }
  }

  /**
   * Reverte a produção do projeto para o último deployment READY anterior ao atual.
   */
  async rollback(projectId: string): Promise<ActionResult> {
    const project = await this.projects.findById(projectId);
    if (!project) return { ok: false, message: 'Projeto não encontrado.' };

    try {
      const ready = await this.vercel.listReadyProductionDeployments(projectId, 5);
      // O índice 0 é o deployment de produção atual; o 1 é o alvo do rollback.
      const target = ready[1];
      if (!target) {
        return {
          ok: false,
          message: `Não há deployment estável anterior em <b>${project.name}</b> para reverter.`,
        };
      }

      await this.vercel.rollback(projectId, target.uid);
      this.logger.info({ projectId, targetId: target.uid }, 'Rollback disparado');
      return {
        ok: true,
        message: `⏪ Rollback de <b>${project.name}</b> iniciado para o deployment anterior.`,
      };
    } catch (error) {
      this.logger.error({ projectId, error: toErrorMessage(error) }, 'Falha no rollback');
      return { ok: false, message: `Falha ao reverter: ${toErrorMessage(error)}` };
    }
  }

  async getLogs(deploymentId: string): Promise<string | null> {
    return this.vercel.getBuildLogsTail(deploymentId, 30);
  }

  /** Logs do deployment mais recente de um projeto (comando /logs). */
  async getLatestLogs(
    projectId: string,
  ): Promise<{ logs: string | null; deploymentId: string | null }> {
    const recent = await this.deployments.findRecent(50);
    const latest = recent.find((d) => d.projectId === projectId);
    if (!latest) return { logs: null, deploymentId: null };
    return { logs: await this.vercel.getBuildLogsTail(latest.id, 30), deploymentId: latest.id };
  }
}
