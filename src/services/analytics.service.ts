import type {
  AnalyticsTotals,
  PageViewInput,
  PageViewRepository,
  TopEntry,
} from '../database/repositories/pageview.repository';
import { toErrorMessage } from '../utils/errors';
import type { Logger } from '../utils/logger';

/** Evento bruto do Web Analytics Drain da Vercel (schema vercel.analytics.v2). */
export interface VercelAnalyticsEvent {
  schema?: string;
  eventType?: string;
  eventName?: string;
  timestamp?: number;
  projectId?: string;
  path?: string;
  sessionId?: number | string;
  deviceId?: number | string;
  country?: string;
  city?: string;
  deviceType?: string;
  osName?: string;
  clientName?: string;
  referrer?: string;
}

function str(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

/**
 * Recebe e consulta os dados de Web Analytics que a Vercel envia via Drain.
 * A coleta é push (a Vercel chama nosso endpoint) — nenhuma chamada de saída.
 */
export class AnalyticsService {
  constructor(
    private readonly pageViews: PageViewRepository,
    private readonly logger: Logger,
  ) {}

  /** Persiste um lote de eventos vindos do Drain. Retorna quantos foram gravados. */
  async ingest(events: VercelAnalyticsEvent[]): Promise<number> {
    const rows: PageViewInput[] = events
      .filter((e) => e.eventType === 'pageview' || e.eventType === 'event')
      .map((e) => ({
        projectId: str(e.projectId),
        eventType: e.eventType === 'event' ? 'event' : 'pageview',
        eventName: str(e.eventName),
        path: str(e.path),
        deviceId: str(e.deviceId),
        sessionId: str(e.sessionId),
        country: str(e.country),
        city: str(e.city),
        deviceType: str(e.deviceType),
        osName: str(e.osName),
        clientName: str(e.clientName),
        referrer: str(e.referrer),
        occurredAt: e.timestamp ? new Date(e.timestamp) : new Date(),
      }));

    if (rows.length === 0) return 0;
    try {
      const count = await this.pageViews.createMany(rows);
      this.logger.debug({ count }, 'Eventos de analytics ingeridos');
      return count;
    } catch (error) {
      this.logger.error({ error: toErrorMessage(error) }, 'Falha ao gravar eventos de analytics');
      return 0;
    }
  }

  totals(from: Date, to: Date, projectId?: string): Promise<AnalyticsTotals> {
    return this.pageViews.totals(from, to, projectId);
  }

  totalsByProject(from: Date, to: Date) {
    return this.pageViews.totalsByProject(from, to);
  }

  topPages(from: Date, to: Date, limit = 5, projectId?: string): Promise<TopEntry[]> {
    return this.pageViews.topBy('path', from, to, limit, projectId);
  }

  topCountries(from: Date, to: Date, limit = 5, projectId?: string): Promise<TopEntry[]> {
    return this.pageViews.topBy('country', from, to, limit, projectId);
  }

  topDevices(from: Date, to: Date, limit = 5, projectId?: string): Promise<TopEntry[]> {
    return this.pageViews.topBy('deviceType', from, to, limit, projectId);
  }
}
