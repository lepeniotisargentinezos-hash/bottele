import type { ProjectRepository } from '../database/repositories/project.repository';
import type { RevenueTotals, SaleRepository } from '../database/repositories/sale.repository';
import { toErrorMessage } from '../utils/errors';
import type { Logger } from '../utils/logger';

/** Payload do webhook de transação do AnubisPay (campos relevantes). */
export interface AnubisWebhookEvent {
  Id?: string;
  ExternalId?: string;
  Amount?: number; // em reais
  Status?: string;
  PaymentMethod?: string;
  PostbackUrl?: string;
  CreatedAt?: string;
  UpdatedAt?: string;
  PaidAt?: string;
}

export interface IngestResult {
  ok: boolean;
  becamePaid: boolean;
  projectName: string | null;
  site: string | null;
  amountCents: number;
  occurredAt: Date;
}

function normalizeHost(value: string): string {
  return value
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
}

function hostFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

/** Converte a data do AnubisPay (ISO ou dd/mm/yyyy HH:mm:ss) em Date. */
function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  // Ignora a data "zero" do .NET.
  if (value.startsWith('0001-01-01')) return null;
  const iso = new Date(value);
  if (!Number.isNaN(iso.getTime())) return iso;
  const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
  if (m) {
    return new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}`);
  }
  return null;
}

/**
 * Recebe os webhooks de transação do AnubisPay, registra cada venda e
 * atribui ao site pelo domínio presente no PostbackUrl. Expõe consultas
 * de receita e conversão.
 */
export class SalesService {
  constructor(
    private readonly sales: SaleRepository,
    private readonly projects: ProjectRepository,
    private readonly logger: Logger,
  ) {}

  private async resolveProject(
    postbackUrl: string | undefined,
  ): Promise<{ projectId: string | null; site: string | null; name: string | null }> {
    const host = postbackUrl ? hostFromUrl(postbackUrl) : null;
    if (!host) return { projectId: null, site: null, name: null };

    const projects = await this.projects.findAllActive();
    const match = projects.find((project) => {
      const candidates = [project.name, project.productionUrl ?? '', ...project.domains]
        .filter(Boolean)
        .map(normalizeHost);
      return candidates.includes(host);
    });
    return { projectId: match?.id ?? null, site: host, name: match?.name ?? host };
  }

  async ingest(event: AnubisWebhookEvent): Promise<IngestResult> {
    const status = (event.Status ?? 'unknown').toLowerCase();
    const amountCents = Math.round((event.Amount ?? 0) * 100);
    const occurredAt =
      (status === 'paid' ? parseDate(event.PaidAt) : null) ??
      parseDate(event.UpdatedAt) ??
      parseDate(event.CreatedAt) ??
      new Date();

    const id = event.Id ?? event.ExternalId;
    if (!id) {
      this.logger.warn({ event }, 'Webhook AnubisPay sem Id; ignorado');
      return {
        ok: false,
        becamePaid: false,
        projectName: null,
        site: null,
        amountCents: 0,
        occurredAt,
      };
    }

    try {
      const { projectId, site, name } = await this.resolveProject(event.PostbackUrl);
      const { previousStatus } = await this.sales.upsert({
        id,
        projectId,
        site,
        amountCents,
        status,
        product: null,
        occurredAt,
      });

      const becamePaid = status === 'paid' && previousStatus !== 'paid';
      this.logger.info({ id, status, amountCents, site }, 'Venda AnubisPay registrada');
      return { ok: true, becamePaid, projectName: name, site, amountCents, occurredAt };
    } catch (error) {
      this.logger.error({ id, error: toErrorMessage(error) }, 'Falha ao registrar venda');
      return {
        ok: false,
        becamePaid: false,
        projectName: null,
        site: null,
        amountCents,
        occurredAt,
      };
    }
  }

  totals(from: Date, to: Date, projectId?: string): Promise<RevenueTotals> {
    return this.sales.totals(from, to, projectId);
  }

  revenueByProject(from: Date, to: Date) {
    return this.sales.revenueByProject(from, to);
  }
}
