import type { PrismaClient, Sale } from '@prisma/client';

export interface UpsertSaleInput {
  id: string;
  projectId: string | null;
  site: string | null;
  amountCents: number;
  status: string;
  product: string | null;
  occurredAt: Date;
}

export interface SaleTransition {
  sale: Sale;
  previousStatus: string | null;
}

export interface RevenueTotals {
  paidCount: number;
  totalCount: number;
  revenueCents: number;
}

export class SaleRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** Upsert por id da transação, devolvendo o status anterior (para detectar venda nova). */
  async upsert(input: UpsertSaleInput): Promise<SaleTransition> {
    const existing = await this.prisma.sale.findUnique({
      where: { id: input.id },
      select: { status: true },
    });
    const sale = await this.prisma.sale.upsert({
      where: { id: input.id },
      create: input,
      update: {
        status: input.status,
        amountCents: input.amountCents,
        occurredAt: input.occurredAt,
        // projeto/site só são preenchidos se vierem resolvidos (não sobrescreve com null).
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.site ? { site: input.site } : {}),
      },
    });
    return { sale, previousStatus: existing?.status ?? null };
  }

  /** Receita (pagos) e contagens no período, opcionalmente por projeto. */
  async totals(from: Date, to: Date, projectId?: string): Promise<RevenueTotals> {
    const where = {
      occurredAt: { gte: from, lt: to },
      ...(projectId ? { projectId } : {}),
    };
    const [totalCount, paid] = await Promise.all([
      this.prisma.sale.count({ where }),
      this.prisma.sale.aggregate({
        where: { ...where, status: 'paid' },
        _count: { _all: true },
        _sum: { amountCents: true },
      }),
    ]);
    return {
      totalCount,
      paidCount: paid._count._all,
      revenueCents: paid._sum.amountCents ?? 0,
    };
  }

  /** Receita paga por projeto no período, do maior para o menor. */
  async revenueByProject(
    from: Date,
    to: Date,
  ): Promise<Array<{ projectId: string; revenueCents: number; paidCount: number }>> {
    const grouped = await this.prisma.sale.groupBy({
      by: ['projectId'],
      where: { occurredAt: { gte: from, lt: to }, status: 'paid', projectId: { not: null } },
      _sum: { amountCents: true },
      _count: { _all: true },
    });
    return grouped
      .map((g) => ({
        projectId: g.projectId as string,
        revenueCents: g._sum.amountCents ?? 0,
        paidCount: g._count._all,
      }))
      .sort((a, b) => b.revenueCents - a.revenueCents);
  }

  /** Timestamp da última venda paga de um projeto (para detectar "parou de vender"). */
  async lastPaidAt(projectId: string): Promise<Date | null> {
    const last = await this.prisma.sale.findFirst({
      where: { projectId, status: 'paid' },
      orderBy: { occurredAt: 'desc' },
      select: { occurredAt: true },
    });
    return last?.occurredAt ?? null;
  }
}
