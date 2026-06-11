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
  ) {}

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
}
