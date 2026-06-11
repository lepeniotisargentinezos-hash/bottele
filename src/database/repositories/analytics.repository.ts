import type { Prisma, PrismaClient } from '@prisma/client';

export interface UpsertSnapshotInput {
  projectId: string;
  date: Date;
  visitors: number;
  uniqueVisitors: number;
  pageViews: number;
  topPages?: Prisma.InputJsonValue;
  countries?: Prisma.InputJsonValue;
  devices?: Prisma.InputJsonValue;
}

export interface AnalyticsTotals {
  visitors: number;
  uniqueVisitors: number;
  pageViews: number;
}

export class AnalyticsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  upsertSnapshot(input: UpsertSnapshotInput) {
    const { projectId, date, ...data } = input;
    return this.prisma.analyticsSnapshot.upsert({
      where: { projectId_date: { projectId, date } },
      create: { projectId, date, ...data },
      update: data,
    });
  }

  async totalsBetween(from: Date, to: Date): Promise<AnalyticsTotals> {
    const result = await this.prisma.analyticsSnapshot.aggregate({
      where: { date: { gte: from, lt: to } },
      _sum: { visitors: true, uniqueVisitors: true, pageViews: true },
    });
    return {
      visitors: result._sum.visitors ?? 0,
      uniqueVisitors: result._sum.uniqueVisitors ?? 0,
      pageViews: result._sum.pageViews ?? 0,
    };
  }

  async totalsByProjectBetween(
    from: Date,
    to: Date,
  ): Promise<
    Array<{ projectId: string; projectName: string; visitors: number; pageViews: number }>
  > {
    const grouped = await this.prisma.analyticsSnapshot.groupBy({
      by: ['projectId'],
      where: { date: { gte: from, lt: to } },
      _sum: { visitors: true, pageViews: true },
      orderBy: { _sum: { pageViews: 'desc' } },
    });
    if (grouped.length === 0) return [];

    const projects = await this.prisma.project.findMany({
      where: { id: { in: grouped.map((g) => g.projectId) } },
      select: { id: true, name: true },
    });
    const nameById = new Map(projects.map((p) => [p.id, p.name]));

    return grouped.map((g) => ({
      projectId: g.projectId,
      projectName: nameById.get(g.projectId) ?? g.projectId,
      visitors: g._sum.visitors ?? 0,
      pageViews: g._sum.pageViews ?? 0,
    }));
  }

  findSnapshots(projectId: string, from: Date, to: Date) {
    return this.prisma.analyticsSnapshot.findMany({
      where: { projectId, date: { gte: from, lt: to } },
      orderBy: { date: 'asc' },
    });
  }
}
