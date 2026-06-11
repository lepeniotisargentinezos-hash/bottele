import type { Deployment, DeploymentState, PrismaClient } from '@prisma/client';

export interface UpsertDeploymentInput {
  id: string;
  projectId: string;
  state: DeploymentState;
  url: string | null;
  target: string | null;
  branch: string | null;
  commitSha: string | null;
  commitMessage: string | null;
  commitAuthor: string | null;
  errorMessage: string | null;
  vercelCreatedAt: Date;
  readyAt: Date | null;
}

export interface DeploymentTransition {
  deployment: Deployment;
  previousState: DeploymentState | null;
}

export class DeploymentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** Upsert que devolve o estado anterior, para detectar transições (ex.: BUILDING -> ERROR). */
  async upsertTrackingTransition(input: UpsertDeploymentInput): Promise<DeploymentTransition> {
    const existing = await this.prisma.deployment.findUnique({
      where: { id: input.id },
      select: { state: true },
    });
    const deployment = await this.prisma.deployment.upsert({
      where: { id: input.id },
      create: input,
      update: {
        state: input.state,
        errorMessage: input.errorMessage ?? undefined,
        readyAt: input.readyAt ?? undefined,
        url: input.url ?? undefined,
      },
    });
    return { deployment, previousState: existing?.state ?? null };
  }

  findById(id: string): Promise<Deployment | null> {
    return this.prisma.deployment.findUnique({ where: { id } });
  }

  markFailureNotified(id: string): Promise<Deployment> {
    return this.prisma.deployment.update({
      where: { id },
      data: { failureNotifiedAt: new Date() },
    });
  }

  findRecent(limit = 10): Promise<Array<Deployment & { project: { name: string } }>> {
    return this.prisma.deployment.findMany({
      take: limit,
      orderBy: { vercelCreatedAt: 'desc' },
      include: { project: { select: { name: true } } },
    });
  }

  findRecentByProject(projectId: string, limit = 5): Promise<Deployment[]> {
    return this.prisma.deployment.findMany({
      where: { projectId },
      take: limit,
      orderBy: { vercelCreatedAt: 'desc' },
    });
  }

  findRecentFailures(since: Date, limit = 10) {
    return this.prisma.deployment.findMany({
      where: { state: 'ERROR', vercelCreatedAt: { gte: since } },
      take: limit,
      orderBy: { vercelCreatedAt: 'desc' },
      include: { project: { select: { name: true } } },
    });
  }

  countSince(since: Date): Promise<number> {
    return this.prisma.deployment.count({ where: { vercelCreatedAt: { gte: since } } });
  }

  countByStateSince(state: DeploymentState, since: Date): Promise<number> {
    return this.prisma.deployment.count({
      where: { state, vercelCreatedAt: { gte: since } },
    });
  }

  countBetween(from: Date, to: Date): Promise<number> {
    return this.prisma.deployment.count({
      where: { vercelCreatedAt: { gte: from, lt: to } },
    });
  }

  countByStateBetween(state: DeploymentState, from: Date, to: Date): Promise<number> {
    return this.prisma.deployment.count({
      where: { state, vercelCreatedAt: { gte: from, lt: to } },
    });
  }
}
