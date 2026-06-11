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
  check(url: string, timeoutMs: number): Promise<UptimeCheckResult>;
}

/** Implementação real do verificador HTTP usando fetch nativo do Node 22. */
export class FetchHttpChecker implements HttpChecker {
  async check(url: string, timeoutMs: number): Promise<UptimeCheckResult> {
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
      return {
        url,
        success: !isServerError,
        statusCode: response.status,
        responseTimeMs,
        errorType: isServerError ? 'HTTP_ERROR' : null,
        reason: isServerError ? `HTTP ${response.status}` : null,
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
 * Verifica disponibilidade dos domínios de produção de cada projeto,
 * grava métricas e gerencia o ciclo de vida de incidentes de downtime
 * (alerta na queda, alerta na recuperação com duração).
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
      const url = project.productionUrl;
      if (!url) continue;

      try {
        const result = await this.checker.check(url, this.timeoutMs);

        await this.metrics.create({
          projectId: project.id,
          url: result.url,
          statusCode: result.statusCode,
          responseTimeMs: result.responseTimeMs,
          success: result.success,
          errorType: result.errorType,
        });

        await this.reconcileIncident(project.id, project.name, result, alertSettings.downtime);
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
    result: UptimeCheckResult,
    notify: boolean,
  ): Promise<void> {
    const openIncident = await this.incidents.findOpen(projectId, 'DOWNTIME');

    if (!result.success && !openIncident) {
      await this.incidents.open({
        projectId,
        type: 'DOWNTIME',
        url: result.url,
        httpStatus: result.statusCode ?? undefined,
        reason: result.reason ?? undefined,
      });

      if (notify) {
        await this.notifier.send(
          'SITE_DOWN',
          [
            '🔴 <b>SITE FORA DO AR</b>',
            '',
            `Projeto: <b>${escapeHtml(projectName)}</b>`,
            `URL: ${escapeHtml(result.url)}`,
            '',
            `Status: ${result.statusCode ?? escapeHtml(result.reason ?? 'erro desconhecido')}`,
          ].join('\n'),
          { payload: { projectId, url: result.url, status: result.statusCode } },
        );
      }
      return;
    }

    if (result.success && openIncident) {
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
            `URL: ${escapeHtml(result.url)}`,
            '',
            `Tempo de indisponibilidade: ${formatDuration(downtimeMs)}`,
          ].join('\n'),
          { payload: { projectId, downtimeMs } },
        );
      }
    }
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

  async globalUptimePercent(since: Date): Promise<number> {
    const counters = await this.metrics.uptimeCounters(null, since);
    return counters.total === 0 ? 100 : (counters.successful / counters.total) * 100;
  }

  globalDowntimeMs(since: Date): Promise<number> {
    return this.incidents.totalDowntimeMsSince(since);
  }
}
