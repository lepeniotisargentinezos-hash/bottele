import type { Prisma, PrismaClient } from '@prisma/client';

export interface PageViewInput {
  projectId: string | null;
  eventType: string;
  eventName: string | null;
  path: string | null;
  deviceId: string | null;
  sessionId: string | null;
  country: string | null;
  city: string | null;
  deviceType: string | null;
  osName: string | null;
  clientName: string | null;
  referrer: string | null;
  occurredAt: Date;
}

export interface AnalyticsTotals {
  visitors: number;
  pageViews: number;
}

export interface TopEntry {
  label: string;
  count: number;
}

export class PageViewRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createMany(events: PageViewInput[]): Promise<number> {
    if (events.length === 0) return 0;
    const result = await this.prisma.pageView.createMany({ data: events });
    return result.count;
  }

  /** Visitantes únicos (device_id distinto) e total de page views no período. */
  async totals(from: Date, to: Date, projectId?: string): Promise<AnalyticsTotals> {
    const where: Prisma.PageViewWhereInput = {
      occurredAt: { gte: from, lt: to },
      eventType: 'pageview',
      ...(projectId ? { projectId } : {}),
    };
    const [pageViews, distinct] = await Promise.all([
      this.prisma.pageView.count({ where }),
      this.prisma.pageView.findMany({
        where: { ...where, deviceId: { not: null } },
        distinct: ['deviceId'],
        select: { deviceId: true },
      }),
    ]);
    return { pageViews, visitors: distinct.length };
  }

  /** Totais por projeto no período, ordenados por visitantes. */
  async totalsByProject(
    from: Date,
    to: Date,
  ): Promise<Array<{ projectId: string; visitors: number; pageViews: number }>> {
    const rows = await this.prisma.pageView.findMany({
      where: { occurredAt: { gte: from, lt: to }, eventType: 'pageview', projectId: { not: null } },
      select: { projectId: true, deviceId: true },
    });

    const byProject = new Map<string, { pageViews: number; devices: Set<string> }>();
    for (const row of rows) {
      const pid = row.projectId as string;
      const entry = byProject.get(pid) ?? { pageViews: 0, devices: new Set() };
      entry.pageViews++;
      if (row.deviceId) entry.devices.add(row.deviceId);
      byProject.set(pid, entry);
    }

    return [...byProject.entries()]
      .map(([projectId, v]) => ({ projectId, pageViews: v.pageViews, visitors: v.devices.size }))
      .sort((a, b) => b.visitors - a.visitors);
  }

  /** Top valores de um campo (path, country, deviceType...) por nº de page views. */
  async topBy(
    field: 'path' | 'country' | 'deviceType' | 'osName' | 'referrer',
    from: Date,
    to: Date,
    limit = 5,
    projectId?: string,
  ): Promise<TopEntry[]> {
    const grouped = await this.prisma.pageView.groupBy({
      by: [field],
      where: {
        occurredAt: { gte: from, lt: to },
        eventType: 'pageview',
        [field]: { not: null },
        ...(projectId ? { projectId } : {}),
      },
      _count: { _all: true },
      orderBy: { _count: { [field]: 'desc' } },
      take: limit,
    });
    return grouped.map((g) => ({
      label: String((g as Record<string, unknown>)[field] ?? '—'),
      count: g._count._all,
    }));
  }

  async pruneOlderThan(date: Date): Promise<number> {
    const result = await this.prisma.pageView.deleteMany({ where: { occurredAt: { lt: date } } });
    return result.count;
  }
}
