import { describe, expect, it } from 'vitest';
import { mapVercelDeployment } from '../../src/services/deployment-monitor.service';
import type { VercelDeployment } from '../../src/integrations/vercel/types';

describe('mapVercelDeployment — variações de metadados', () => {
  it('usa metadados do GitLab quando GitHub não está presente', () => {
    const deployment: VercelDeployment = {
      uid: 'dpl_gl1',
      name: 'app',
      url: null,
      readyState: 'READY',
      created: 1700000000000,
      meta: {
        gitlabCommitRef: 'develop',
        gitlabCommitSha: 'gl123456789',
        gitlabCommitMessage: 'chore: gitlab',
        gitlabCommitAuthorName: 'Ciclana',
      },
    };

    const input = mapVercelDeployment(deployment, 'prj_1');
    expect(input.branch).toBe('develop');
    expect(input.commitSha).toBe('gl123456789');
    expect(input.commitAuthor).toBe('Ciclana');
    expect(input.url).toBeNull();
  });

  it('lida com deployment sem metadados de git', () => {
    const deployment: VercelDeployment = {
      uid: 'dpl_cli1',
      name: 'app',
      url: 'app-cli.vercel.app',
      created: 1700000000000,
    };

    const input = mapVercelDeployment(deployment, 'prj_1');
    expect(input.state).toBe('QUEUED'); // sem readyState nem state
    expect(input.branch).toBeNull();
    expect(input.commitSha).toBeNull();
    expect(input.commitAuthor).toBeNull();
    expect(input.readyAt).toBeNull();
  });

  it('usa state quando readyState está ausente', () => {
    const deployment: VercelDeployment = {
      uid: 'dpl_state1',
      name: 'app',
      url: null,
      state: 'CANCELED',
      created: 1700000000000,
    };

    expect(mapVercelDeployment(deployment, 'prj_1').state).toBe('CANCELED');
  });

  it('usa o login do autor do GitHub como fallback do nome', () => {
    const deployment: VercelDeployment = {
      uid: 'dpl_login1',
      name: 'app',
      url: null,
      readyState: 'READY',
      created: 1700000000000,
      ready: 1700000060000,
      meta: { githubCommitAuthorLogin: 'octocat' },
    };

    const input = mapVercelDeployment(deployment, 'prj_1');
    expect(input.commitAuthor).toBe('octocat');
    expect(input.readyAt).toEqual(new Date(1700000060000));
  });
});
