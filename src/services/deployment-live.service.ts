import type { DeploymentState } from '@prisma/client';
import type { VercelClient } from '../integrations/vercel/client';
import type { DeploymentRepository } from '../database/repositories/deployment.repository';
import type { ProjectRepository } from '../database/repositories/project.repository';
import type { TelegramNotifier } from '../integrations/telegram/notifier';
import type { SettingsService } from './settings.service';
import { buildDeployFailureMessage } from './deployment-monitor.service';
import { escapeHtml, formatDuration, shortSha } from '../utils/format';
import { toErrorMessage } from '../utils/errors';
import type { Logger } from '../utils/logger';

/** Payload dos webhooks de deployment da Vercel (campos que usamos). */
export interface VercelWebhookEvent {
  id: string;
  type: string;
  createdAt: number;
  payload: {
    deployment?: {
      id: string;
      url?: string | null;
      name?: string;
      meta?: Record<string, string | undefined>;
    };
    project?: { id: string };
    target?: string | null;
    links?: { deployment?: string };
  };
}

const HANDLED_EVENTS = new Set([
  'deployment.created',
  'deployment.succeeded',
  'deployment.ready',
  'deployment.error',
  'deployment.canceled',
]);

interface LiveMessage {
  messageId: number;
  startedAt: number;
}

/**
 * Processa eventos de webhook da Vercel em tempo real:
 *  - deployment.created  → mensagem "🔨 Deploy iniciado" (produção)
 *  - succeeded/error/canceled → edita a mesma mensagem com o resultado
 *  - error/canceled → alerta completo de falha (com motivo do erro)
 *
 * O rastreio de mensagens é em memória: se o processo reiniciar no meio
 * de um deploy, o resultado chega como mensagem nova em vez de edição.
 * O polling continua ativo como backup — a flag failureNotifiedAt evita
 * alertas duplicados entre os dois caminhos.
 */
export class DeploymentLiveService {
  private readonly liveMessages = new Map<string, LiveMessage>();

  constructor(
    private readonly vercel: VercelClient,
    private readonly deployments: DeploymentRepository,
    private readonly projects: ProjectRepository,
    private readonly notifier: TelegramNotifier,
    private readonly settings: SettingsService,
    private readonly logger: Logger,
  ) {}

  async handleEvent(event: VercelWebhookEvent): Promise<void> {
    if (!HANDLED_EVENTS.has(event.type)) {
      this.logger.debug({ type: event.type }, 'Evento de webhook ignorado');
      return;
    }

    const deployment = event.payload.deployment;
    const projectId = event.payload.project?.id;
    if (!deployment?.id || !projectId) {
      this.logger.warn({ type: event.type }, 'Webhook sem deployment/project no payload');
      return;
    }

    try {
      switch (event.type) {
        case 'deployment.created':
          await this.onCreated(event, deployment, projectId);
          break;
        case 'deployment.succeeded':
        case 'deployment.ready':
          await this.onFinished(event, deployment, projectId, 'READY');
          break;
        case 'deployment.error':
          await this.onFinished(event, deployment, projectId, 'ERROR');
          break;
        case 'deployment.canceled':
          await this.onFinished(event, deployment, projectId, 'CANCELED');
          break;
      }
    } catch (error) {
      this.logger.error(
        { type: event.type, deploymentId: deployment.id, error: toErrorMessage(error) },
        'Falha ao processar webhook',
      );
    }
  }

  private async upsert(
    event: VercelWebhookEvent,
    deployment: NonNullable<VercelWebhookEvent['payload']['deployment']>,
    projectId: string,
    state: DeploymentState,
  ) {
    const meta = deployment.meta ?? {};
    return this.deployments.upsertTrackingTransition({
      id: deployment.id,
      projectId,
      state,
      url: deployment.url ? `https://${deployment.url}` : null,
      target: event.payload.target ?? null,
      branch: meta.githubCommitRef ?? meta.gitlabCommitRef ?? null,
      commitSha: meta.githubCommitSha ?? meta.gitlabCommitSha ?? null,
      commitMessage: meta.githubCommitMessage ?? meta.gitlabCommitMessage ?? null,
      commitAuthor:
        meta.githubCommitAuthorName ??
        meta.githubCommitAuthorLogin ??
        meta.gitlabCommitAuthorName ??
        null,
      errorMessage: null,
      vercelCreatedAt: new Date(event.createdAt),
      readyAt: state === 'READY' ? new Date() : null,
    });
  }

  private async projectName(projectId: string, fallback?: string): Promise<string> {
    const project = await this.projects.findById(projectId);
    return project?.name ?? fallback ?? projectId;
  }

  private async onCreated(
    event: VercelWebhookEvent,
    deployment: NonNullable<VercelWebhookEvent['payload']['deployment']>,
    projectId: string,
  ): Promise<void> {
    await this.upsert(event, deployment, projectId, 'BUILDING');

    // Mensagens de progresso só para produção — deploys de preview a cada
    // push poluiriam o chat. Falhas alertam em qualquer ambiente.
    if (event.payload.target !== 'production') return;

    const name = await this.projectName(projectId, deployment.name);
    const meta = deployment.meta ?? {};
    const branch = meta.githubCommitRef ?? meta.gitlabCommitRef ?? 'n/d';
    const sha = meta.githubCommitSha ?? meta.gitlabCommitSha ?? null;

    const messageId = await this.notifier.sendTracked(
      'SYSTEM',
      [
        '🔨 <b>Deploy iniciado</b>',
        '',
        `Projeto: <b>${escapeHtml(name)}</b>`,
        `Branch: ${escapeHtml(branch)} · <code>${escapeHtml(shortSha(sha))}</code>`,
        '',
        '⏳ Acompanhando em tempo real...',
      ].join('\n'),
      { payload: { deploymentId: deployment.id, event: event.type } },
    );

    if (messageId !== null) {
      this.liveMessages.set(deployment.id, { messageId, startedAt: Date.now() });
    }
  }

  private async onFinished(
    event: VercelWebhookEvent,
    deployment: NonNullable<VercelWebhookEvent['payload']['deployment']>,
    projectId: string,
    state: DeploymentState,
  ): Promise<void> {
    const { deployment: stored } = await this.upsert(event, deployment, projectId, state);
    const name = await this.projectName(projectId, deployment.name);
    const live = this.liveMessages.get(deployment.id);
    this.liveMessages.delete(deployment.id);

    const duration = live ? formatDuration(Date.now() - live.startedAt) : null;

    if (state === 'READY') {
      if (live) {
        await this.notifier.edit(
          live.messageId,
          [
            '✅ <b>Deploy concluído</b>',
            '',
            `Projeto: <b>${escapeHtml(name)}</b>`,
            `Branch: ${escapeHtml(stored.branch ?? 'n/d')} · <code>${escapeHtml(shortSha(stored.commitSha))}</code>`,
            duration ? `Duração: ${duration}` : null,
            stored.url ? `URL: ${escapeHtml(stored.url)}` : null,
          ]
            .filter((line): line is string => line !== null)
            .join('\n'),
        );
      } else {
        const alertSettings = await this.settings.getAlertSettings();
        if (alertSettings.deploySuccess) {
          await this.notifier.send(
            'DEPLOY_READY',
            `✅ Deploy concluído: <b>${escapeHtml(name)}</b>${stored.url ? `\n${escapeHtml(stored.url)}` : ''}`,
          );
        }
      }
      return;
    }

    // ERROR ou CANCELED
    const icon = state === 'CANCELED' ? '⚠️' : '🚨';
    const label = state === 'CANCELED' ? 'Deploy cancelado' : 'Deploy falhou';

    if (live) {
      await this.notifier.edit(
        live.messageId,
        [
          `${icon} <b>${label}</b>`,
          '',
          `Projeto: <b>${escapeHtml(name)}</b>`,
          duration ? `Duração: ${duration}` : null,
          '',
          'Detalhes do erro na próxima mensagem ⬇️',
        ]
          .filter((line): line is string => line !== null)
          .join('\n'),
      );
    }

    const alertSettings = await this.settings.getAlertSettings();
    if (!alertSettings.deployFailures || stored.failureNotifiedAt !== null) return;

    const errorReason =
      state === 'ERROR' ? await this.vercel.getDeploymentErrorReason(deployment.id) : null;

    const sent = await this.notifier.send(
      'DEPLOY_FAILED',
      buildDeployFailureMessage(name, stored, errorReason),
      {
        payload: { deploymentId: deployment.id, projectName: name, state, source: 'webhook' },
        buttons:
          state === 'ERROR'
            ? [
                { text: '🔄 Redeploy', action: `redeploy:${deployment.id}` },
                { text: '📜 Ver logs', action: `logs:${deployment.id}` },
              ]
            : undefined,
      },
    );

    if (sent) {
      await this.deployments.markFailureNotified(deployment.id);
    }
  }
}
