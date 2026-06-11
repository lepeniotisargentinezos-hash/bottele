import type { VercelDeployment, VercelProject } from '../../src/integrations/vercel/types';

export const projectFixture: VercelProject = {
  id: 'prj_abc123',
  name: 'dashboard-app',
  framework: 'nextjs',
  createdAt: 1700000000000,
  updatedAt: 1700000100000,
  targets: {
    production: { alias: ['dashboard-app.vercel.app', 'dashboard.example.com'] },
  },
};

export const secondProjectFixture: VercelProject = {
  id: 'prj_def456',
  name: 'landing-page',
  framework: 'astro',
  createdAt: 1700000200000,
  updatedAt: 1700000300000,
  targets: { production: { alias: ['landing.example.com'] } },
};

export const readyDeploymentFixture: VercelDeployment = {
  uid: 'dpl_ready1',
  name: 'dashboard-app',
  url: 'dashboard-app-abc.vercel.app',
  readyState: 'READY',
  target: 'production',
  created: 1700000400000,
  ready: 1700000460000,
  meta: {
    githubCommitRef: 'main',
    githubCommitSha: 'abc1234def5678',
    githubCommitMessage: 'feat: nova feature',
    githubCommitAuthorName: 'Fulano',
  },
};

export const failedDeploymentFixture: VercelDeployment = {
  uid: 'dpl_failed1',
  name: 'dashboard-app',
  url: 'dashboard-app-err.vercel.app',
  readyState: 'ERROR',
  target: 'production',
  created: 1700000500000,
  meta: {
    githubCommitRef: 'main',
    githubCommitSha: 'bad1234def5678',
    githubCommitMessage: 'fix: tentativa de correção',
    githubCommitAuthorName: 'Fulano',
  },
  errorMessage: 'Build failed: Module not found',
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
