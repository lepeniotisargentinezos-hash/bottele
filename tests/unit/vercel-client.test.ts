import { describe, expect, it, vi } from 'vitest';
import { VercelClient } from '../../src/integrations/vercel/client';
import { VercelApiError } from '../../src/utils/errors';
import { logger } from '../../src/utils/logger';
import {
  failedDeploymentFixture,
  jsonResponse,
  projectFixture,
  readyDeploymentFixture,
  secondProjectFixture,
} from '../mocks/vercel.fixtures';

function createClient(fetchFn: typeof fetch, teamId?: string): VercelClient {
  return new VercelClient({ token: 'test-token', teamId, logger, fetchFn });
}

describe('VercelClient', () => {
  it('envia o token no header Authorization', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ projects: [], pagination: { count: 0, next: null, prev: null } }),
      );
    const client = createClient(fetchMock as unknown as typeof fetch);

    await client.listAllProjects();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
  });

  it('inclui teamId na query quando configurado', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ projects: [], pagination: { count: 0, next: null, prev: null } }),
      );
    const client = createClient(fetchMock as unknown as typeof fetch, 'team_xyz');

    await client.listAllProjects();

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('teamId=team_xyz');
  });

  it('pagina automaticamente a lista de projetos', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          projects: [projectFixture],
          pagination: { count: 1, next: 1700000000000, prev: null },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          projects: [secondProjectFixture],
          pagination: { count: 1, next: null, prev: null },
        }),
      );
    const client = createClient(fetchMock as unknown as typeof fetch);

    const projects = await client.listAllProjects();

    expect(projects).toHaveLength(2);
    expect(projects.map((p) => p.name)).toEqual(['dashboard-app', 'landing-page']);
    const [secondUrl] = fetchMock.mock.calls[1] as [string];
    expect(secondUrl).toContain('until=1700000000000');
  });

  it('lista deployments de um projeto', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        deployments: [readyDeploymentFixture, failedDeploymentFixture],
        pagination: { count: 2, next: null, prev: null },
      }),
    );
    const client = createClient(fetchMock as unknown as typeof fetch);

    const deployments = await client.listDeployments('prj_abc123');

    expect(deployments).toHaveLength(2);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('projectId=prj_abc123');
  });

  it('faz retry em erros 5xx e depois sucede', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'oops' }, 500))
      .mockResolvedValueOnce(
        jsonResponse({ projects: [], pagination: { count: 0, next: null, prev: null } }),
      );
    const client = createClient(fetchMock as unknown as typeof fetch);

    const projects = await client.listAllProjects();

    expect(projects).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('lança VercelApiError em erros 4xx sem retry', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'forbidden' }, 403));
    const client = createClient(fetchMock as unknown as typeof fetch);

    await expect(client.listDeployments('prj_abc123')).rejects.toBeInstanceOf(VercelApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('extrai motivo do erro a partir dos eventos do deployment', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([
        { type: 'stdout', created: 1, payload: { text: 'Installing dependencies...' } },
        { type: 'error', created: 2, payload: { text: 'Module not found: ./missing' } },
      ]),
    );
    const client = createClient(fetchMock as unknown as typeof fetch);

    const reason = await client.getDeploymentErrorReason('dpl_failed1');

    expect(reason).toBe('Module not found: ./missing');
  });

  it('getWebAnalytics retorna null quando o plano não tem acesso (403)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'forbidden' }, 403));
    const client = createClient(fetchMock as unknown as typeof fetch);

    const stats = await client.getWebAnalytics('prj_abc123', new Date(0), new Date());

    expect(stats).toBeNull();
  });
});
