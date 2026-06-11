import { describe, expect, it, vi } from 'vitest';
import { DeployActionsService } from '../../src/services/deploy-actions.service';
import { logger } from '../../src/utils/logger';

function buildService(
  overrides: {
    deployment?: unknown;
    project?: unknown;
    readyDeployments?: unknown[];
  } = {},
) {
  const vercel = {
    redeploy: vi.fn().mockResolvedValue({ uid: 'dpl_new' }),
    rollback: vi.fn().mockResolvedValue(undefined),
    listReadyProductionDeployments: vi
      .fn()
      .mockResolvedValue(
        overrides.readyDeployments ?? [{ uid: 'dpl_atual' }, { uid: 'dpl_anterior' }],
      ),
    getBuildLogsTail: vi.fn().mockResolvedValue('linha de log'),
  };
  const deployments = {
    findById: vi
      .fn()
      .mockResolvedValue(
        overrides.deployment === undefined
          ? { id: 'dpl_1', projectId: 'prj_1', target: 'production' }
          : overrides.deployment,
      ),
    findRecent: vi.fn().mockResolvedValue([{ id: 'dpl_1', projectId: 'prj_1' }]),
  };
  const projects = {
    findById: vi
      .fn()
      .mockResolvedValue(
        overrides.project === undefined ? { id: 'prj_1', name: 'app' } : overrides.project,
      ),
  };

  const service = new DeployActionsService(
    vercel as never,
    deployments as never,
    projects as never,
    logger,
  );
  return { service, vercel };
}

describe('DeployActionsService.redeploy', () => {
  it('dispara redeploy com nome e target do projeto', async () => {
    const { service, vercel } = buildService();
    const result = await service.redeploy('dpl_1');
    expect(result.ok).toBe(true);
    expect(vercel.redeploy).toHaveBeenCalledWith('app', 'dpl_1', 'production');
  });

  it('falha graciosamente quando o deployment não existe', async () => {
    const { service, vercel } = buildService({ deployment: null });
    const result = await service.redeploy('dpl_x');
    expect(result.ok).toBe(false);
    expect(vercel.redeploy).not.toHaveBeenCalled();
  });
});

describe('DeployActionsService.rollback', () => {
  it('reverte para o deployment anterior ao atual', async () => {
    const { service, vercel } = buildService();
    const result = await service.rollback('prj_1');
    expect(result.ok).toBe(true);
    expect(vercel.rollback).toHaveBeenCalledWith('prj_1', 'dpl_anterior');
  });

  it('falha quando não há deployment anterior', async () => {
    const { service, vercel } = buildService({ readyDeployments: [{ uid: 'dpl_unico' }] });
    const result = await service.rollback('prj_1');
    expect(result.ok).toBe(false);
    expect(vercel.rollback).not.toHaveBeenCalled();
  });
});

describe('DeployActionsService.getLatestLogs', () => {
  it('retorna os logs do deploy mais recente do projeto', async () => {
    const { service } = buildService();
    const { logs, deploymentId } = await service.getLatestLogs('prj_1');
    expect(logs).toBe('linha de log');
    expect(deploymentId).toBe('dpl_1');
  });
});
