import type { ProjectRepository } from '../database/repositories/project.repository';
import type { MetricRepository } from '../database/repositories/metric.repository';
import type { IncidentRepository } from '../database/repositories/incident.repository';
import type { TelegramNotifier } from '../integrations/telegram/notifier';
import type { SettingsService } from './settings.service';
import type { UptimeCheckResult, UptimeStats } from '../types';
import { escapeHtml, formatDuration } from '../utils/format';
import { toErrorMessage } from '../utils/errors';
import type { Logger } from '../utils/logger';

const MONITORED_ERROR_STATUSES = [500, 502, 503, 504];

export interface HttpChecker {
  check(url: string, timeoutMs: number, expectedText?: string): Promise<UptimeCheckResult>;
}

/** Implementação real do verificador HTTP usando fetch nativo do Node 22. */
export class FetchHttpChecker implements HttpChecker {
  async check(url: string, timeoutMs: number, expectedText?: string): Promise<UptimeCheckResult> {
    const startedAt = performance.now();
    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'User-Agent': 'vercel-telegram-monitor/1.0 (uptime-check)' },
      });
      const responseTimeMs = Math.round(performance.now() - startedAt);

      const isServerError = MONITORED_ERROR_STATUSES.includes(response.status);
      if (isServerError) {
        return {
          url,
          success: false,
          statusCode: response.status,
          responseTimeMs,
          errorType: 'HTTP_ERROR',
          reason: `HTTP ${response.status}`,
        };
      }

      // Checagem de conteúdo: detecta páginas que respondem 200 mas estão quebradas.
      if (expectedText) {
        const body = await response.text();
        if (!body.includes(expectedText)) {
          return {
            url,
            success: false,
            statusCode: response.status,
            responseTimeMs: Math.round(performance.now() - startedAt),
            errorType: 'CONTENT_MISMATCH',
            reason: `Texto esperado ausente: "${expectedText.slice(0, 50)}"`,
          };
        }
      }

      return {
        url,
        success: true,
        statusCode: response.status,
        responseTimeMs,
        errorType: null,
        reason: null,
      };
    } catch (error) {
      const responseTimeMs = Math.round(performance.now() - startedAt);
      return {
        url,
        success: false,
        statusCode: null,
        responseTimeMs,
        ...classifyFetchError(error),
      };
    }
  }
}

export function classifyFetchError(error: unknown): {
  errorType: NonNullable<UptimeCheckResult['errorType']>;
  reason: string;
} {
  const message = toErrorMessage(error);
  const cause =
    error instanceof Error && error.cause instanceof Error ? error.cause.message : message;

  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return { errorType: 'TIMEOUT', reason: 'Timeout na requisição' };
  }
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(cause)) {
    return { errorType: 'DNS_ERROR', reason: 'DNS inválido ou não resolvido' };
  }
  return { errorType: 'NETWORK_ERROR', reason: cause.slice(0, 200) };
}

/**
 * Verifica disponibilidade dos domínios de produção de cada projeto
 * (home + URLs extras configuradas + checagem de conteúdo opcional),
 * grava métricas e gerencia o ciclo de vida de incidentes de downtime.
 */
export class UptimeService {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly metrics: MetricRepository,
    private readonly incidents: IncidentRepository,
    private readonly notifier: TelegramNotifier,
    private readonly settings: SettingsService,
    private readonly checker: HttpChecker,
    private readonly timeoutMs: number,
    private readonly logger: Logger,
  ) {}

  async checkAll(): Promise<void> {
    const projects = await this.projects.findAllActive();
    const alertSettings = await this.settings.getAlertSettings();

    for (const project of projects) {
      if (!project.productionUrl) continue;

      try {
        const config = await this.settings.getProjectCheck(project.id);
        const urls = [project.productionUrl, ...config.extraUrls];

        const results: UptimeCheckResult[] = [];
        for (const url of urls) {
          // A checagem de conteúdo só se aplica à home (primeira URL).
          const expectedText = url === project.productionUrl ? config.expectedText : undefined;
          const result = await this.checker.check(url, this.timeoutMs, expectedText);
          results.push(result);
          await this.metrics.create({
            projectId: project.id,
            url: result.url,
            statusCode: result.statusCode,
            responseTimeMs: result.responseTimeMs,
            success: result.success,
            errorType: result.errorType,
          });
        }

        await this.reconcileIncident(project.id, project.name, results, alertSettings.downtime);
      } catch (error) {
        this.logger.error(
          { project: project.name, error: toErrorMessage(error) },
          'Falha inesperada no check de uptime',
        );
      }
    }
  }

  private async reconcileIncident(
    projectId: string,
    projectName: string,
    results: UptimeCheckResult[],
    notify: boolean,
  ): Promise<void> {
    const failure = results.find((r) => !r.success);
    const openIncident = await this.incidents.findOpen(projectId, 'DOWNTIME');

    if (failure && !openIncident) {
      await this.incidents.open({
        projectId,
        type: 'DOWNTIME',
        url: failure.url,
        httpStatus: failure.statusCode ?? undefined,
        reason: failure.reason ?? undefined,
      });

      if (notify) {
        await this.notifier.send(
          'SITE_DOWN',
          [
            '🔴 <b>SITE FORA DO AR</b>',
            '',
            `Projeto: <b>${escapeHtml(projectName)}</b>`,
            `URL: ${escapeHtml(failure.url)}`,
            '',
            `Status: ${failure.statusCode ?? escapeHtml(failure.reason ?? 'erro desconhecido')}`,
          ].join('\n'),
          {
            payload: { projectId, url: failure.url, status: failure.statusCode },
            buttons: [{ text: '🔍 Checar agora', action: `recheck:${projectId}` }],
          },
        );
      }
      return;
    }

    if (!failure && openIncident) {
      const resolved = await this.incidents.resolve(openIncident.id);
      const downtimeMs =
        (resolved.resolvedAt?.getTime() ?? Date.now()) - resolved.startedAt.getTime();

      if (notify) {
        await this.notifier.send(
          'SITE_RECOVERED',
          [
            '🟢 <b>SERVIÇO RESTABELECIDO</b>',
            '',
            `Projeto: <b>${escapeHtml(projectName)}</b>`,
            `URL: ${escapeHtml(openIncident.url ?? projectName)}`,
            '',
            `Tempo de indisponibilidade: ${formatDuration(downtimeMs)}`,
          ].join('\n'),
          { payload: { projectId, downtimeMs } },
        );
      }
    }
  }

  /** Re-checa um projeto sob demanda (botão "Checar agora"). Retorna o resumo. */
  async recheckProject(projectId: string): Promise<UptimeCheckResult[]> {
    const project = await this.projects.findById(projectId);
    if (!project?.productionUrl) return [];
    const config = await this.settings.getProjectCheck(projectId);
    const urls = [project.productionUrl, ...config.extraUrls];
    const results: UptimeCheckResult[] = [];
    for (const url of urls) {
      const expectedText = url === project.productionUrl ? config.expectedText : undefined;
      results.push(await this.checker.check(url, this.timeoutMs, expectedText));
    }
    return results;
  }

  /**
   * Checa a home de todos os projetos ativos ao vivo, em paralelo.
   * Usado pelo /projects para mostrar o estado real no momento do comando.
   */
  async liveStatusAll(): Promise<Array<{ name: string; url: string; result: UptimeCheckResult }>> {
    const projects = await this.projects.findAllActive();
    const checks = projects
      .filter((project) => project.productionUrl)
      .map(async (project) => {
        const config = await this.settings.getProjectCheck(project.id);
        const url = project.productionUrl as string;
        const result = await this.checker.check(url, this.timeoutMs, config.expectedText);
        return { name: project.name, url, result };
      });
    return Promise.all(checks);
  }

  async statsFor(projectId: string, projectName: string, since: Date): Promise<UptimeStats> {
    const counters = await this.metrics.uptimeCounters(projectId, since);
    const downtimeMs = await this.incidents.totalDowntimeMsSince(since, projectId);
    return {
      projectId,
      projectName,
      totalChecks: counters.total,
      successfulChecks: counters.successful,
      uptimePercent: counters.total === 0 ? 100 : (counters.successful / counters.total) * 100,
      totalDowntimeMs: downtimeMs,
    };
  }

  async globalUptimePercent(since: Date, until?: Date): Promise<number> {
    const counters = await this.metrics.uptimeCounters(null, since, until);
    return counters.total === 0 ? 100 : (counters.successful / counters.total) * 100;
  }

  globalDowntimeMs(since: Date): Promise<number> {
    return this.incidents.totalDowntimeMsSince(since);
  }
}
