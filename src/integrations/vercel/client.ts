import { VercelApiError } from '../../utils/errors';
import { sleep } from '../../utils/sleep';
import type { Logger } from '../../utils/logger';
import type {
  VercelDeployment,
  VercelDeploymentEvent,
  VercelDeploymentsResponse,
  VercelDomainsResponse,
  VercelProject,
  VercelProjectsResponse,
  VercelWebAnalyticsStats,
} from './types';

const BASE_URL = 'https://api.vercel.com';
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;

export interface VercelClientOptions {
  token: string;
  teamId?: string;
  logger: Logger;
  fetchFn?: typeof fetch;
  baseUrl?: string;
}

/**
 * Camada única de comunicação com a API REST da Vercel.
 * Centraliza autenticação, paginação, retries e tratamento de erros.
 */
export class VercelClient {
  private readonly token: string;
  private readonly teamId?: string;
  private readonly logger: Logger;
  private readonly fetchFn: typeof fetch;
  private readonly baseUrl: string;

  constructor(options: VercelClientOptions) {
    this.token = options.token;
    this.teamId = options.teamId;
    this.logger = options.logger;
    this.fetchFn = options.fetchFn ?? fetch;
    this.baseUrl = options.baseUrl ?? BASE_URL;
  }

  private buildUrl(path: string, params: Record<string, string | number | undefined> = {}): string {
    const url = new URL(path, this.baseUrl);
    if (this.teamId) url.searchParams.set('teamId', this.teamId);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  private async request<T>(
    path: string,
    params: Record<string, string | number | undefined> = {},
    options: { method?: 'GET' | 'POST'; body?: unknown } = {},
  ): Promise<T> {
    const url = this.buildUrl(path, params);
    const method = options.method ?? 'GET';

    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await this.fetchFn(url, {
          method,
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
          body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        });

        if (response.ok) {
          return (await response.json()) as T;
        }

        // 429 e 5xx são transitórios: tenta novamente com backoff exponencial.
        if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
          const retryAfter = Number(response.headers.get('retry-after')) || 0;
          const delay = Math.max(retryAfter * 1000, RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
          this.logger.warn(
            { path, status: response.status, attempt, delay },
            'Vercel API retornou erro transitório; tentando novamente',
          );
          await sleep(delay);
          continue;
        }

        const body = await response.text().catch(() => '');
        throw new VercelApiError(
          `Vercel API ${response.status} em ${path}: ${body.slice(0, 300)}`,
          response.status,
          path,
        );
      } catch (error) {
        if (error instanceof VercelApiError) throw error;
        lastError = error;
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
          continue;
        }
      }
    }

    throw new VercelApiError(
      `Falha de rede ao chamar Vercel API em ${path}: ${String(lastError)}`,
      0,
      path,
    );
  }

  /** Lista todos os projetos da conta, percorrendo todas as páginas. */
  async listAllProjects(): Promise<VercelProject[]> {
    const projects: VercelProject[] = [];
    let until: number | undefined;

    for (;;) {
      const response = await this.request<VercelProjectsResponse>('/v9/projects', {
        limit: 100,
        until,
      });
      projects.push(...response.projects);
      if (!response.pagination?.next) break;
      until = response.pagination.next;
    }

    return projects;
  }

  async listDeployments(projectId: string, limit = 20): Promise<VercelDeployment[]> {
    const response = await this.request<VercelDeploymentsResponse>('/v6/deployments', {
      projectId,
      limit,
    });
    return response.deployments;
  }

  async getDeployment(deploymentId: string): Promise<VercelDeployment> {
    return this.request<VercelDeployment>(`/v13/deployments/${deploymentId}`);
  }

  /** Deployments de produção em estado READY, do mais recente para o mais antigo. */
  async listReadyProductionDeployments(projectId: string, limit = 20): Promise<VercelDeployment[]> {
    const response = await this.request<VercelDeploymentsResponse>('/v6/deployments', {
      projectId,
      target: 'production',
      state: 'READY',
      limit,
    });
    return response.deployments;
  }

  /**
   * Recria um deployment a partir de um anterior (mesmo commit/git source).
   * Equivale ao botão "Redeploy" do dashboard.
   */
  async redeploy(
    projectName: string,
    deploymentId: string,
    target: string | null,
  ): Promise<VercelDeployment> {
    return this.request<VercelDeployment>(
      '/v13/deployments',
      {},
      {
        method: 'POST',
        body: { name: projectName, deploymentId, target: target ?? 'production' },
      },
    );
  }

  /**
   * Reverte a produção para um deployment anterior (Instant Rollback).
   * `deploymentId` é o deployment estável para onde o tráfego deve voltar.
   */
  async rollback(projectId: string, deploymentId: string): Promise<void> {
    await this.request(
      `/v9/projects/${projectId}/rollback/${deploymentId}`,
      {},
      { method: 'POST', body: {} },
    );
  }

  /** Eventos de build de um deployment — usado para extrair o motivo de falhas. */
  async getDeploymentEvents(deploymentId: string): Promise<VercelDeploymentEvent[]> {
    return this.request<VercelDeploymentEvent[]>(`/v3/deployments/${deploymentId}/events`, {
      limit: 100,
    });
  }

  async getDeploymentErrorReason(deploymentId: string): Promise<string | null> {
    try {
      const events = await this.getDeploymentEvents(deploymentId);
      const errorLines = events
        .filter((event) => event.type === 'error' || event.type === 'fatal')
        .map((event) => event.payload?.text)
        .filter((text): text is string => Boolean(text));
      if (errorLines.length === 0) {
        // Fallback: últimas linhas de stdout costumam conter o erro de build.
        const lastLines = events
          .filter((event) => event.type === 'stdout' || event.type === 'stderr')
          .slice(-5)
          .map((event) => event.payload?.text)
          .filter((text): text is string => Boolean(text));
        return lastLines.length > 0 ? lastLines.join('\n') : null;
      }
      return errorLines.slice(-10).join('\n');
    } catch (error) {
      this.logger.warn({ deploymentId, error }, 'Não foi possível obter eventos do deployment');
      return null;
    }
  }

  /** Últimas `lines` linhas de log de build (stdout/stderr/error), em ordem cronológica. */
  async getBuildLogsTail(deploymentId: string, lines = 30): Promise<string | null> {
    try {
      const events = await this.getDeploymentEvents(deploymentId);
      const logLines = events
        .filter((event) => ['stdout', 'stderr', 'error', 'fatal'].includes(event.type))
        .map((event) => event.payload?.text)
        .filter((text): text is string => Boolean(text));
      if (logLines.length === 0) return null;
      return logLines.slice(-lines).join('\n');
    } catch (error) {
      this.logger.warn({ deploymentId, error }, 'Não foi possível obter logs do deployment');
      return null;
    }
  }

  async listProjectDomains(projectId: string): Promise<string[]> {
    const response = await this.request<VercelDomainsResponse>(
      `/v9/projects/${projectId}/domains`,
      { limit: 50 },
    );
    return response.domains.filter((domain) => domain.verified).map((domain) => domain.name);
  }

  /**
   * Web Analytics da Vercel não possui API pública estável.
   * Tenta o endpoint interno e degrada graciosamente (retorna null)
   * quando o plano/token não tem acesso.
   */
  async getWebAnalytics(
    projectId: string,
    from: Date,
    to: Date,
  ): Promise<VercelWebAnalyticsStats | null> {
    try {
      const params = {
        projectId,
        environment: 'production',
        from: from.toISOString(),
        to: to.toISOString(),
      };

      const [overview, pages, countries, devices] = await Promise.all([
        this.request<{ total?: number; visitors?: number; pageviews?: number; devices?: number }>(
          '/v1/web-analytics/overview',
          params,
        ),
        this.request<{ data?: Array<{ key: string; total: number }> }>(
          '/v1/web-analytics/timeseries/path',
          { ...params, limit: 10 },
        ).catch(() => ({ data: [] })),
        this.request<{ data?: Array<{ key: string; devices: number }> }>(
          '/v1/web-analytics/timeseries/country',
          { ...params, limit: 10 },
        ).catch(() => ({ data: [] })),
        this.request<{ data?: Array<{ key: string; devices: number }> }>(
          '/v1/web-analytics/timeseries/os_name',
          { ...params, limit: 10 },
        ).catch(() => ({ data: [] })),
      ]);

      return {
        visitors: overview.visitors ?? overview.devices ?? 0,
        uniqueVisitors: overview.devices ?? overview.visitors ?? 0,
        pageViews: overview.pageviews ?? overview.total ?? 0,
        topPages: (pages.data ?? []).map((p) => ({ page: p.key, views: p.total })),
        countries: (countries.data ?? []).map((c) => ({ country: c.key, visitors: c.devices })),
        devices: (devices.data ?? []).map((d) => ({ device: d.key, visitors: d.devices })),
      };
    } catch (error) {
      if (error instanceof VercelApiError && [400, 402, 403, 404].includes(error.httpStatus)) {
        this.logger.debug(
          { projectId, status: error.httpStatus },
          'Web Analytics indisponível para este projeto/plano',
        );
        return null;
      }
      throw error;
    }
  }

  /** Verificação simples de conectividade/credenciais. */
  async ping(): Promise<boolean> {
    try {
      await this.request('/v2/user');
      return true;
    } catch {
      return false;
    }
  }
}
