import type { DeploymentState } from '@prisma/client';
import type { VercelClient } from '../integrations/vercel/client';
import type { VercelDeployment } from '../integrations/vercel/types';
import type {
  DeploymentRepository,
  UpsertDeploymentInput,
} from '../database/repositories/deployment.repository';
import type { ProjectRepository } from '../database/repositories/project.repository';
import type { TelegramNotifier } from '../integrations/telegram/notifier';
import type { SettingsService } from './settings.service';
import { escapeHtml, formatDateTime, shortSha } from '../utils/format';
import { toErrorMessage } from '../utils/errors';
import type { Logger } from '../utils/logger';
import { env } from '../config/env';

const FINAL_FAILURE_STATES: DeploymentState[] = ['ERROR', 'CANCELED'];

export function mapVercelDeployment(
  deployment: VercelDeployment,
  projectId: string,
): UpsertDeploymentInput {
  const state = (deployment.readyState ?? deployment.state ?? 'QUEUED') as DeploymentState;
  const meta = deployment.meta ?? {};
  return {
    id: deployment.uid,
    projectId,
    state,
    url: deployment.url ? `https://${deployment.url}` : null,
    target: deployment.target ?? null,
    branch: meta.githubCommitRef ?? meta.gitlabCommitRef ?? null,
    commitSha: meta.githubCommitSha ?? meta.gitlabCommitSha ?? null,
    commitMessage: meta.githubCommitMessage ?? meta.gitlabCommitMessage ?? null,
    commitAuthor:
      meta.githubCommitAuthorName ??
      meta.githubCommitAuthorLogin ??
      meta.gitlabCommitAuthorName ??
      null,
    errorMessage: deployment.errorMessage ?? null,
    vercelCreatedAt: new Date(deployment.created),
    readyAt: deployment.ready ? new Date(deployment.ready) : null,
  };
}

/**
 * Acompanha o ciclo de vida dos deployments de todos os projetos.
 * Detecta transições para estados finais e alerta sobre falhas
 * com branch, commit, autor e motivo do erro.
 */
export class DeploymentMonitorService {
  constructor(
    private readonly vercel: VercelClient,
    private readonly deployments: DeploymentRepository,
    private readonly projects: ProjectRepository,
    private readonly notifier: TelegramNotifier,
    private readonly settings: SettingsService,
    private readonly logger: Logger,
  ) {}

  async checkAll(): Promise<void> {
    const projects = await this.projects.findAllActive();
    const alertSettings = await this.settings.getAlertSettings();

    for (const project of projects) {
      try {
        await this.checkProject(project.id, project.name, alertSettings.deployFailures);
      } catch (error) {
        this.logger.error(
          { project: project.name, error: toErrorMessage(error) },
          'Falha ao verificar deployments do projeto',
        );
      }
    }
  }

  private async checkProject(
    projectId: string,
    projectName: string,
    notifyFailures: boolean,
  ): Promise<void> {
    const vercelDeployments = await this.vercel.listDeployments(projectId, 10);

    for (const vercelDeployment of vercelDeployments) {
      const input = mapVercelDeployment(vercelDeployment, projectId);
      const { deployment, previousState } = await this.deployments.upsertTrackingTransition(input);

      const becameFailure =
        FINAL_FAILURE_STATES.includes(deployment.state) &&
        previousState !== deployment.state &&
        deployment.failureNotifiedAt === null;

      if (becameFailure && notifyFailures) {
        await this.notifyFailure(projectName, deployment.id);
      }
    }
  }

  private async notifyFailure(projectName: string, deploymentId: string): Promise<void> {
    const deployment = await this.deployments.findById(deploymentId);
    if (!deployment) return;

    let errorReason = deployment.errorMessage;
    if (!errorReason) {
      errorReason = await this.vercel.getDeploymentErrorReason(deploymentId);
    }

    const isCanceled = deployment.state === 'CANCELED';
    const title = isCanceled ? '⚠️ <b>DEPLOY CANCELADO</b>' : '🚨 <b>DEPLOY FALHOU</b>';

    const lines = [
      title,
      '',
      `Projeto: <b>${escapeHtml(projectName)}</b>`,
      `Branch: ${escapeHtml(deployment.branch ?? 'n/d')}`,
      `Commit: <code>${escapeHtml(shortSha(deployment.commitSha))}</code>`,
      deployment.commitMessage ? `Mensagem: ${escapeHtml(deployment.commitMessage)}` : null,
      `Autor: ${escapeHtml(deployment.commitAuthor ?? 'n/d')}`,
      `Horário: ${formatDateTime(deployment.vercelCreatedAt, env.TZ)}`,
      deployment.url ? `URL: ${escapeHtml(deployment.url)}` : null,
    ].filter((line): line is string => line !== null);

    if (!isCanceled) {
      lines.push(
        '',
        'Erro:',
        `<pre>${escapeHtml((errorReason ?? 'Motivo não disponível').slice(0, 1500))}</pre>`,
      );
    }

    const sent = await this.notifier.send('DEPLOY_FAILED', lines.join('\n'), {
      payload: { deploymentId, projectName, state: deployment.state },
    });

    if (sent) {
      await this.deployments.markFailureNotified(deploymentId);
    }
  }
}
