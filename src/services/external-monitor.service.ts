import type { SettingsRepository } from '../database/repositories/settings.repository';
import type { SettingsService } from './settings.service';
import type { TelegramNotifier } from '../integrations/telegram/notifier';
import type { HttpChecker } from './uptime.service';
import type { UptimeCheckResult } from '../types';
import { escapeHtml, formatDuration } from '../utils/format';
import { toErrorMessage } from '../utils/errors';
import type { Logger } from '../utils/logger';

const STATE_KEY = 'external_monitor_state';

interface MonitorState {
  [name: string]: { down: boolean; since: string };
}

export interface ExternalMonitorStatus {
  name: string;
  url: string;
  result: UptimeCheckResult;
}

/**
 * Monitora serviços externos críticos (ex.: gateway de pagamento AnubisPay).
 * Quando um serviço cai, os sites param de vender — por isso o alerta é
 * imediato, separado dos incidentes de projeto. Estado em settings.
 */
export class ExternalMonitorService {
  constructor(
    private readonly settings: SettingsService,
    private readonly settingsRepo: SettingsRepository,
    private readonly notifier: TelegramNotifier,
    private readonly checker: HttpChecker,
    private readonly timeoutMs: number,
    private readonly logger: Logger,
    private readonly monitorToken?: string,
  ) {}

  /** Anexa o token de monitoramento à URL, para liberar os detalhes do /api/health. */
  private withToken(rawUrl: string): string {
    if (!this.monitorToken) return rawUrl;
    try {
      const url = new URL(rawUrl);
      url.searchParams.set('token', this.monitorToken);
      return url.toString();
    } catch {
      return rawUrl;
    }
  }

  async checkAll(): Promise<void> {
    const monitors = await this.settings.getExternalMonitors();
    if (monitors.length === 0) return;

    const state = (await this.settingsRepo.get<MonitorState>(STATE_KEY)) ?? {};
    let changed = false;

    for (const monitor of monitors) {
      try {
        const result = await this.checker.check(monitor.url, this.timeoutMs);
        const prev = state[monitor.name] ?? { down: false, since: new Date().toISOString() };

        if (!result.success && !prev.down) {
          state[monitor.name] = { down: true, since: new Date().toISOString() };
          changed = true;
          await this.notifier.send(
            'SYSTEM',
            [
              '🔌 <b>SERVIÇO EXTERNO FORA DO AR</b>',
              '',
              `Serviço: <b>${escapeHtml(monitor.name)}</b>`,
              `URL: ${escapeHtml(monitor.url)}`,
              '',
              `Motivo: ${escapeHtml(result.statusCode ? `HTTP ${result.statusCode}` : (result.reason ?? 'sem resposta'))}`,
              '',
              '⚠️ Pagamentos/integrações que dependem deste serviço podem estar afetados.',
            ].join('\n'),
            { payload: { monitor: monitor.name } },
          );
        } else if (result.success && prev.down) {
          const downtimeMs = Date.now() - new Date(prev.since).getTime();
          state[monitor.name] = { down: false, since: new Date().toISOString() };
          changed = true;
          await this.notifier.send(
            'SYSTEM',
            [
              '✅ <b>SERVIÇO EXTERNO RESTABELECIDO</b>',
              '',
              `Serviço: <b>${escapeHtml(monitor.name)}</b>`,
              `Tempo fora: ${formatDuration(downtimeMs)}`,
            ].join('\n'),
            { payload: { monitor: monitor.name } },
          );
        }
      } catch (error) {
        this.logger.error(
          { monitor: monitor.name, error: toErrorMessage(error) },
          'Falha ao checar serviço externo',
        );
      }
    }

    if (changed) await this.settingsRepo.set(STATE_KEY, state);
  }

  /** Checa todos os monitores ao vivo (para o comando /monitor). */
  async liveStatus(): Promise<ExternalMonitorStatus[]> {
    const monitors = await this.settings.getExternalMonitors();
    return Promise.all(
      monitors.map(async (monitor) => ({
        name: monitor.name,
        url: monitor.url,
        result: await this.checker.check(monitor.url, this.timeoutMs),
      })),
    );
  }

  /**
   * Inspeciona cada monitor lendo o corpo JSON (ex.: o /api/health dos sites),
   * extraindo o status e a conta do gateway. Usado pelo /overview para mostrar
   * qual conta de pagamento cada domínio utiliza.
   */
  async inspect(): Promise<
    Array<{ name: string; host: string; ok: boolean; account: string | null }>
  > {
    const monitors = await this.settings.getExternalMonitors();
    return Promise.all(
      monitors.map(async (monitor) => {
        let host = monitor.url;
        try {
          host = new URL(monitor.url).hostname.replace(/^www\./, '').toLowerCase();
        } catch {
          // URL malformada — mantém o valor original.
        }

        try {
          const response = await fetch(this.withToken(monitor.url), {
            redirect: 'follow',
            signal: AbortSignal.timeout(this.timeoutMs),
          });
          const data = (await response.json().catch(() => null)) as { account?: unknown } | null;
          const account =
            data && typeof data.account === 'string' && data.account ? data.account : null;
          return { name: monitor.name, host, ok: response.ok, account };
        } catch (error) {
          this.logger.warn(
            { monitor: monitor.name, error: toErrorMessage(error) },
            'Falha ao inspecionar gateway',
          );
          return { name: monitor.name, host, ok: false, account: null };
        }
      }),
    );
  }
}
