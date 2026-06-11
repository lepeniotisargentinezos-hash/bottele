import { describe, expect, it, vi } from 'vitest';
import {
  DeploymentMonitorService,
  mapVercelDeployment,
} from '../../src/services/deployment-monitor.service';
import { logger } from '../../src/utils/logger';
import { failedDeploymentFixture, readyDeploymentFixture } from '../mocks/vercel.fixtures';

describe('mapVercelDeployment', () => {
  it('extrai branch, commit e autor dos metadados do GitHub', () => {
    const input = mapVercelDeployment(failedDeploymentFixture, 'prj_1');
    expect(input).toMatchObject({
      id: 'dpl_failed1',
      projectId: 'prj_1',
      state: 'ERROR',
      branch: 'main',
      commitSha: 'bad1234def5678',
      commitAuthor: 'Fulano',
      errorMessage: 'Build failed: Module not found',
    });
    expect(input.url).toBe('https://dashboard-app-err.vercel.app');
  });
});

function buildService(options: {
  previousState: string | null;
  storedState?: string;
  failureNotifiedAt?: Date | null;
}) {
  const storedDeployment = {
    id: 'dpl_failed1',
    state: options.storedState ?? 'ERROR',
    branch: 'main',
    commitSha: 'bad1234def5678',
    commitMessage: 'fix: tentativa de correção',
    commitAuthor: 'Fulano',
    errorMessage: 'Build failed: Module not found',
    url: 'https://dashboard-app-err.vercel.app',
    vercelCreatedAt: new Date(1700000500000),
    failureNotifiedAt: options.failureNotifiedAt ?? null,
  };

  const vercel = {
    listDeployments: vi.fn().mockResolvedValue([failedDeploymentFixture, readyDeploymentFixture]),
    getDeploymentErrorReason: vi.fn().mockResolvedValue('Module not found: ./missing'),
  };
  const deployments = {
    upsertTrackingTransition: vi.fn().mockImplementation((input: { id: string }) =>
      Promise.resolve({
        deployment:
          input.id === 'dpl_failed1'
            ? storedDeployment
            : { ...storedDeployment, id: input.id, state: 'READY' },
        previousState: input.id === 'dpl_failed1' ? options.previousState : 'READY',
      }),
    ),
    findById: vi.fn().mockResolvedValue(storedDeployment),
    markFailureNotified: vi.fn().mockResolvedValue(storedDeployment),
  };
  const projects = {
    findAllActive: vi.fn().mockResolvedValue([{ id: 'prj_1', name: 'dashboard-app' }]),
  };
  const notifier = { send: vi.fn().mockResolvedValue(true) };
  const settings = {
    getAlertSettings: vi.fn().mockResolvedValue({ deployFailures: true }),
  };

  const service = new DeploymentMonitorService(
    vercel as never,
    deployments as never,
    projects as never,
    notifier as never,
    settings as never,
    logger,
  );

  return { service, notifier, deployments };
}

describe('DeploymentMonitorService', () => {
  it('alerta quando um deployment transiciona para ERROR', async () => {
    const { service, notifier, deployments } = buildService({ previousState: 'BUILDING' });
    await service.checkAll();

    expect(notifier.send).toHaveBeenCalledTimes(1);
    const [type, message] = notifier.send.mock.calls[0] as [string, string];
    expect(type).toBe('DEPLOY_FAILED');
    expect(message).toContain('DEPLOY FALHOU');
    expect(message).toContain('dashboard-app');
    expect(message).toContain('main');
    expect(message).toContain('bad1234');
    expect(message).toContain('Fulano');
    expect(message).toContain('Build failed: Module not found');
    expect(deployments.markFailureNotified).toHaveBeenCalledWith('dpl_failed1');
  });

  it('não alerta novamente um deployment já notificado', async () => {
    const { service, notifier } = buildService({
      previousState: 'ERROR',
      failureNotifiedAt: new Date(),
    });
    await service.checkAll();
    expect(notifier.send).not.toHaveBeenCalled();
  });

  it('não alerta deployments que já estavam em ERROR sem transição', async () => {
    const { service, notifier } = buildService({ previousState: 'ERROR' });
    await service.checkAll();
    expect(notifier.send).not.toHaveBeenCalled();
  });
});
