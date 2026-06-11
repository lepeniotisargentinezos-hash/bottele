import type { PrismaClient } from '@prisma/client';

export interface CreateMetricInput {
  projectId: string;
  url: string;
  statusCode: number | null;
  responseTimeMs: number;
  success: boolean;
  errorType: string | null;
}

export interface UptimeCounters {
  total: number;
  successful: number;
}

export class MetricRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(input: CreateMetricInput) {
    return this.prisma.metric.create({ data: input });
  }

  /** Tempos de resposta (apenas checks bem-sucedidos) para cálculo de percentis. */
  async responseTimesSince(projectId: string, since: Date): Promise<number[]> {
    const metrics = await this.prisma.metric.findMany({
      where: { projectId, success: true, checkedAt: { gte: since } },
      select: { responseTimeMs: true },
      orderBy: { checkedAt: 'desc' },
      take: 5000,
    });
    return metrics.map((m) => m.responseTimeMs);
  }

  async uptimeCounters(
    projectId: string | null,
    since: Date,
    until?: Date,
  ): Promise<UptimeCounters> {
    const where = {
      checkedAt: until ? { gte: since, lt: until } : { gte: since },
      ...(projectId ? { projectId } : {}),
    };
    const [total, successful] = await Promise.all([
      this.prisma.metric.count({ where }),
      this.prisma.metric.count({ where: { ...where, success: true } }),
    ]);
    return { total, successful };
  }

  /** Remove métricas antigas para evitar crescimento sem limites da tabela. */
  async pruneOlderThan(date: Date): Promise<number> {
    const result = await this.prisma.metric.deleteMany({ where: { checkedAt: { lt: date } } });
    return result.count;
  }
}
