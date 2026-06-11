import { describe, expect, it, vi } from 'vitest';
import {
  DeploymentLiveService,
  type VercelWebhookEvent,
} from '../../src/services/deployment-live.service';
import { logger } from '../../src/utils/logger';

function makeEvent(type: string, target = 'production'): VercelWebhookEvent {
  return {
    id: `evt_${type}`,
    type,
    createdAt: 1700000000000,
    payload: {
      deployment: {
        id: 'dpl_live1',
        url: 'app-live.vercel.app',
        name: 'dashboard-app',
        meta: {
          githubCommitRef: 'main',
          githubCommitSha: 'live1234def',
          githubCommitAuthorName: 'Fulano',
        },
      },
      project: { id: 'prj_1' },
      target,
    },
  };
}

function buildService(options: { failureNotifiedAt?: Date | null } = {}) {
  const storedDeployment = {
    id: 'dpl_live1',
    state: 'ERROR',
    branch: 'main',
    commitSha: 'live1234def',
    commitMessage: null,
    commitAuthor: 'Fulano',
    errorMessage: null,
    url: 'https://app-live.vercel.app',
    vercelCreatedAt: new Date(1700000000000),
    failureNotifiedAt: options.failureNotifiedAt ?? null,
  };

  const vercel = {
    getDeploymentErrorReason: vi.fn().mockResolvedValue('Build quebrou: módulo ausente'),
  };
  const deployments = {
    upsertTrackingTransition: vi
      .fn()
      .mockImplementation(({ state }: { state: string }) =>
        Promise.resolve({ deployment: { ...storedDeployment, state }, previousState: null }),
      ),
    markFailureNotified: vi.fn().mockResolvedValue(storedDeployment),
  };
  const projects = {
    findById: vi.fn().mockResolvedValue({ id: 'prj_1', name: 'dashboard-app' }),
  };
  const notifier = {
    sendTracked: vi.fn().mockResolvedValue(777),
    send: vi.fn().mockResolvedValue(true),
    edit: vi.fn().mockResolvedValue(true),
  };
  const settings = {
    getAlertSettings: vi.fn().mockResolvedValue({ deployFailures: true, deploySuccess: false }),
  };

  const service = new DeploymentLiveService(
    vercel as never,
    deployments as never,
    projects as never,
    notifier as never,
    settings as never,
    logger,
  );

  return { service, notifier, deployments, vercel };
}

describe('DeploymentLiveService', () => {
  it('deployment.created em produção envia mensagem viva', async () => {
    const { service, notifier, deployments } = buildService();
    await service.handleEvent(makeEvent('deployment.created'));

    expect(deployments.upsertTrackingTransition).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'dpl_live1', state: 'BUILDING' }),
    );
    expect(notifier.sendTracked).toHaveBeenCalledWith(
      'SYSTEM',
      expect.stringContaining('Deploy iniciado'),
      expect.anything(),
    );
  });

  it('deployment.created de preview não envia mensagem de progresso', async () => {
    const { service, notifier } = buildService();
    await service.handleEvent(makeEvent('deployment.created', 'preview'));
    expect(notifier.sendTracked).not.toHaveBeenCalled();
  });

  it('succeeded edita a mensagem viva com duração', async () => {
    const { service, notifier } = buildService();
    await service.handleEvent(makeEvent('deployment.created'));
    await service.handleEvent(makeEvent('deployment.succeeded'));

    expect(notifier.edit).toHaveBeenCalledWith(777, expect.stringContaining('Deploy concluído'));
    expect(notifier.send).not.toHaveBeenCalled(); // deploySuccess=false, sem mensagem extra
  });

  it('error edita a mensagem viva e envia alerta completo com motivo', async () => {
    const { service, notifier, deployments } = buildService();
    await service.handleEvent(makeEvent('deployment.created'));
    await service.handleEvent(makeEvent('deployment.error'));

    expect(notifier.edit).toHaveBeenCalledWith(777, expect.stringContaining('Deploy falhou'));
    expect(notifier.send).toHaveBeenCalledWith(
      'DEPLOY_FAILED',
      expect.stringContaining('Build quebrou: módulo ausente'),
      expect.anything(),
    );
    expect(deployments.markFailureNotified).toHaveBeenCalledWith('dpl_live1');
  });

  it('não duplica alerta de falha já notificada pelo polling', async () => {
    const { service, notifier } = buildService({ failureNotifiedAt: new Date() });
    await service.handleEvent(makeEvent('deployment.error'));
    expect(notifier.send).not.toHaveBeenCalled();
  });

  it('canceled sem mensagem viva envia alerta de cancelamento', async () => {
    const { service, notifier } = buildService();
    await service.handleEvent(makeEvent('deployment.canceled'));

    expect(notifier.send).toHaveBeenCalledWith(
      'DEPLOY_FAILED',
      expect.stringContaining('DEPLOY CANCELADO'),
      expect.anything(),
    );
  });

  it('ignora eventos desconhecidos e payloads incompletos', async () => {
    const { service, notifier, deployments } = buildService();
    await service.handleEvent(makeEvent('deployment.promoted'));
    await service.handleEvent({
      id: 'evt_x',
      type: 'deployment.created',
      createdAt: 1,
      payload: {},
    });

    expect(deployments.upsertTrackingTransition).not.toHaveBeenCalled();
    expect(notifier.sendTracked).not.toHaveBeenCalled();
  });

  it('não derruba o processamento quando o banco falha', async () => {
    const { service, deployments } = buildService();
    deployments.upsertTrackingTransition.mockRejectedValue(new Error('db fora'));
    await expect(service.handleEvent(makeEvent('deployment.created'))).resolves.toBeUndefined();
  });
});
