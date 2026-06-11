import { connect as tlsConnect } from 'node:tls';
import type { ProjectRepository } from '../database/repositories/project.repository';
import type { SettingsRepository } from '../database/repositories/settings.repository';
import type { TelegramNotifier } from '../integrations/telegram/notifier';
import { escapeHtml } from '../utils/format';
import { toErrorMessage } from '../utils/errors';
import type { Logger } from '../utils/logger';

const SSL_STATE_KEY = 'ssl_alert_state';
const ALERT_THRESHOLDS = [14, 7, 3, 1] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface CertificateInfo {
  validTo: Date;
  daysRemaining: number;
}

export interface CertificateChecker {
  check(hostname: string, timeoutMs: number): Promise<CertificateInfo | null>;
}

/** Lê a data de expiração do certificado TLS abrindo conexão direta na porta 443. */
export class TlsCertificateChecker implements CertificateChecker {
  check(hostname: string, timeoutMs: number): Promise<CertificateInfo | null> {
    return new Promise((resolve) => {
      const socket = tlsConnect(
        { host: hostname, port: 443, servername: hostname, timeout: timeoutMs },
        () => {
          const cert = socket.getPeerCertificate();
          socket.end();
          if (!cert || !cert.valid_to) {
            resolve(null);
            return;
          }
          const validTo = new Date(cert.valid_to);
          const daysRemaining = Math.floor((validTo.getTime() - Date.now()) / DAY_MS);
          resolve({ validTo, daysRemaining });
        },
      );

      socket.once('error', () => resolve(null));
      socket.once('timeout', () => {
        socket.destroy();
        resolve(null);
      });
    });
  }
}

interface SslState {
  [hostname: string]: { validTo: string; lastAlertedThreshold: number | null };
}

/**
 * Monitora a expiração dos certificados TLS dos domínios de produção.
 * Alerta uma única vez por faixa (14/7/3/1 dias). Quando o certificado
 * é renovado (nova data de validade), o estado reseta automaticamente.
 */
export class SslService {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly settings: SettingsRepository,
    private readonly notifier: TelegramNotifier,
    private readonly checker: CertificateChecker,
    private readonly timeoutMs: number,
    private readonly logger: Logger,
  ) {}

  private hostnameFromUrl(url: string): string | null {
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }

  async checkAll(): Promise<void> {
    const projects = await this.projects.findAllActive();
    const state = (await this.settings.get<SslState>(SSL_STATE_KEY)) ?? {};
    let stateChanged = false;

    for (const project of projects) {
      if (!project.productionUrl) continue;
      const hostname = this.hostnameFromUrl(project.productionUrl);
      if (!hostname) continue;

      try {
        const cert = await this.checker.check(hostname, this.timeoutMs);
        if (!cert) continue;

        const previous = state[hostname];
        const validToIso = cert.validTo.toISOString();

        // Certificado renovado → zera o histórico de alertas do domínio.
        if (!previous || previous.validTo !== validToIso) {
          state[hostname] = { validTo: validToIso, lastAlertedThreshold: null };
          stateChanged = true;
        }

        const threshold = ALERT_THRESHOLDS.find((t) => cert.daysRemaining <= t);
        const current = state[hostname];

        if (threshold !== undefined && current && current.lastAlertedThreshold !== threshold) {
          await this.notifier.send(
            'SYSTEM',
            [
              '🔐 <b>CERTIFICADO SSL EXPIRANDO</b>',
              '',
              `Projeto: <b>${escapeHtml(project.name)}</b>`,
              `Domínio: ${escapeHtml(hostname)}`,
              '',
              `Expira em <b>${cert.daysRemaining} dia(s)</b> (${cert.validTo.toISOString().slice(0, 10)})`,
            ].join('\n'),
            { payload: { hostname, daysRemaining: cert.daysRemaining } },
          );
          current.lastAlertedThreshold = threshold;
          stateChanged = true;
        }
      } catch (error) {
        this.logger.warn(
          { project: project.name, error: toErrorMessage(error) },
          'Falha ao verificar certificado SSL',
        );
      }
    }

    if (stateChanged) {
      await this.settings.set(SSL_STATE_KEY, state);
    }
  }

  /** Status atual dos certificados (para o comando /uptime ou /status). */
  async statusForAll(): Promise<
    Array<{ project: string; hostname: string; daysRemaining: number }>
  > {
    const projects = await this.projects.findAllActive();
    const result: Array<{ project: string; hostname: string; daysRemaining: number }> = [];

    for (const project of projects) {
      if (!project.productionUrl) continue;
      const hostname = this.hostnameFromUrl(project.productionUrl);
      if (!hostname) continue;
      const cert = await this.checker.check(hostname, this.timeoutMs);
      if (cert) result.push({ project: project.name, hostname, daysRemaining: cert.daysRemaining });
    }

    return result;
  }
}
