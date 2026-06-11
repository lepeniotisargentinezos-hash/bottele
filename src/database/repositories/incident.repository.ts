import type { Incident, IncidentType, PrismaClient } from '@prisma/client';

export interface OpenIncidentInput {
  projectId: string;
  type: IncidentType;
  url?: string;
  httpStatus?: number;
  reason?: string;
}

export class IncidentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findOpen(projectId: string, type: IncidentType): Promise<Incident | null> {
    return this.prisma.incident.findFirst({
      where: { projectId, type, status: 'OPEN' },
      orderBy: { startedAt: 'desc' },
    });
  }

  open(input: OpenIncidentInput): Promise<Incident> {
    return this.prisma.incident.create({
      data: {
        projectId: input.projectId,
        type: input.type,
        url: input.url ?? null,
        httpStatus: input.httpStatus ?? null,
        reason: input.reason ?? null,
        notifiedAt: new Date(),
      },
    });
  }

  resolve(id: string): Promise<Incident> {
    return this.prisma.incident.update({
      where: { id },
      data: { status: 'RESOLVED', resolvedAt: new Date(), recoveryNotifiedAt: new Date() },
    });
  }

  countOpen(): Promise<number> {
    return this.prisma.incident.count({ where: { status: 'OPEN' } });
  }

  listOpen(): Promise<Array<Incident & { project: { name: string } }>> {
    return this.prisma.incident.findMany({
      where: { status: 'OPEN' },
      orderBy: { startedAt: 'desc' },
      include: { project: { select: { name: true } } },
    });
  }

  listSince(since: Date): Promise<Incident[]> {
    return this.prisma.incident.findMany({
      where: { startedAt: { gte: since } },
      orderBy: { startedAt: 'desc' },
    });
  }

  /** Soma da duração (ms) de incidentes de downtime iniciados a partir de `since`. */
  async totalDowntimeMsSince(since: Date, projectId?: string): Promise<number> {
    const incidents = await this.prisma.incident.findMany({
      where: { type: 'DOWNTIME', startedAt: { gte: since }, ...(projectId ? { projectId } : {}) },
      select: { startedAt: true, resolvedAt: true },
    });
    const now = Date.now();
    return incidents.reduce((total, incident) => {
      const end = incident.resolvedAt?.getTime() ?? now;
      return total + Math.max(0, end - incident.startedAt.getTime());
    }, 0);
  }
}
