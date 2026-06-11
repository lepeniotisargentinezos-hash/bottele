import { describe, expect, it, vi } from 'vitest';
import { DeploymentMonitorService } from '../../src/services/deployment-monitor.service';
import { logger } from '../../src/utils/logger';
import type { VercelDeployment } from '../../src/integrations/vercel/types';

const canceledFixture: VercelDeployment = {
  uid: 'dpl_cancel1',
  name: 'dashboard-app',
  url: 'dashboard-app-cnl.vercel.app',
  readyState: 'CANCELED',
  created: 1700000600000,
  meta: { githubCommitRef: 'main', githubCommitSha: 'cnl1234def' },
};

function buildService(options: { notifyFailures?: boolean; listError?: boolean } = {}) {
  const storedDeployment = {
    id: 'dpl_cancel1',
    state: 'CANCELED',
    branch: 'main',
    commitSha: 'cnl1234def',
    commitMessage: null,
    commitAuthor: null,
    errorMessage: null,
    url: 'https://dashboard-app-cnl.vercel.app',
    vercelCreatedAt: new Date(1700000600000),
    failureNotifiedAt: null,
  };

  const vercel = {
    listDeployments: options.listError
      ? vi.fn().mockRejectedValue(new Error('api fora'))
      : vi.fn().mockResolvedValue([canceledFixture]),
    getDeploymentErrorReason: vi.fn().mockResolvedValue(null),
  };
  const deployments = {
    upsertTrackingTransition: vi
      .fn()
      .mockResolvedValue({ deployment: storedDeployment, previousState: 'BUILDING' }),
    findById: vi.fn().mockResolvedValue(storedDeployment),
    markFailureNotified: vi.fn().mockResolvedValue(storedDeployment),
  };
  const projects = {
    findAllActive: vi.fn().mockResolvedValue([{ id: 'prj_1', name: 'dashboard-app' }]),
  };
  const notifier = { send: vi.fn().mockResolvedValue(true) };
  const settings = {
    getAlertSettings: vi.fn().mockResolvedValue({ deployFailures: options.notifyFailures ?? true }),
  };

  const service = new DeploymentMonitorService(
    vercel as never,
    deployments as never,
    projects as never,
    notifier as never,
    settings as never,
    logger,
  );

  return { service, notifier };
}

describe('DeploymentMonitorService — cancelamentos e configuração', () => {
  it('alerta deploy cancelado sem bloco de erro', async () => {
    const { service, notifier } = buildService();
    await service.checkAll();

    const [type, message] = notifier.send.mock.calls[0] as [string, string];
    expect(type).toBe('DEPLOY_FAILED');
    expect(message).toContain('DEPLOY CANCELADO');
    expect(message).not.toContain('Erro:');
  });

  it('respeita deployFailures=false', async () => {
    const { service, notifier } = buildService({ notifyFailures: false });
    await service.checkAll();
    expect(notifier.send).not.toHaveBeenCalled();
  });

  it('não propaga erro da API de um projeto (continua os demais)', async () => {
    const { service } = buildService({ listError: true });
    await expect(service.checkAll()).resolves.toBeUndefined();
  });
});
