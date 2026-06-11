import { describe, expect, it, vi } from 'vitest';
import { ProjectSyncService } from '../../src/services/project-sync.service';
import { logger } from '../../src/utils/logger';
import { projectFixture, secondProjectFixture } from '../mocks/vercel.fixtures';

function buildService(options: { isNew?: boolean } = {}) {
  const vercel = {
    listAllProjects: vi.fn().mockResolvedValue([projectFixture, secondProjectFixture]),
    listProjectDomains: vi.fn().mockResolvedValue(['fallback.example.com']),
  };
  const projects = {
    upsert: vi.fn().mockImplementation(({ id, name }: { id: string; name: string }) =>
      Promise.resolve({
        project: { id, name, framework: 'nextjs', productionUrl: 'https://x.example.com' },
        isNew: options.isNew ?? false,
      }),
    ),
    deactivateMissing: vi.fn().mockResolvedValue(1),
  };
  const notifier = { send: vi.fn().mockResolvedValue(true) };
  const settings = {
    getAlertSettings: vi.fn().mockResolvedValue({ newProjects: true }),
  };

  const service = new ProjectSyncService(
    vercel as never,
    projects as never,
    notifier as never,
    settings as never,
    logger,
  );

  return { service, vercel, projects, notifier };
}

describe('ProjectSyncService', () => {
  it('persiste todos os projetos retornados pela API', async () => {
    const { service, projects } = buildService();
    const result = await service.sync();

    expect(projects.upsert).toHaveBeenCalledTimes(2);
    expect(result.total).toBe(2);
    expect(projects.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'prj_abc123',
        name: 'dashboard-app',
        productionUrl: 'https://dashboard-app.vercel.app',
        domains: ['dashboard-app.vercel.app', 'dashboard.example.com'],
      }),
    );
  });

  it('desativa projetos removidos da conta', async () => {
    const { service, projects } = buildService();
    const result = await service.sync();

    expect(projects.deactivateMissing).toHaveBeenCalledWith(['prj_abc123', 'prj_def456']);
    expect(result.deactivated).toBe(1);
  });

  it('notifica novos projetos detectados', async () => {
    const { service, notifier } = buildService({ isNew: true });
    const result = await service.sync();

    expect(result.created).toBe(2);
    expect(notifier.send).toHaveBeenCalledWith(
      'NEW_PROJECT',
      expect.stringContaining('NOVO PROJETO DETECTADO'),
      expect.anything(),
    );
  });

  it('não notifica quando notifyNewProjects=false (boot inicial)', async () => {
    const { service, notifier } = buildService({ isNew: true });
    await service.sync({ notifyNewProjects: false });
    expect(notifier.send).not.toHaveBeenCalled();
  });
});
