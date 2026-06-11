import type { PrismaClient, Project } from '@prisma/client';

export interface UpsertProjectInput {
  id: string;
  name: string;
  framework: string | null;
  productionUrl: string | null;
  domains: string[];
}

export class ProjectRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsert(input: UpsertProjectInput): Promise<{ project: Project; isNew: boolean }> {
    const existing = await this.prisma.project.findUnique({ where: { id: input.id } });
    const project = await this.prisma.project.upsert({
      where: { id: input.id },
      create: { ...input, lastSyncedAt: new Date() },
      update: {
        name: input.name,
        framework: input.framework,
        productionUrl: input.productionUrl,
        domains: input.domains,
        isActive: true,
        lastSyncedAt: new Date(),
      },
    });
    return { project, isNew: existing === null };
  }

  /** Marca como inativos os projetos que não vieram mais da API (removidos da conta). */
  async deactivateMissing(activeIds: string[]): Promise<number> {
    const result = await this.prisma.project.updateMany({
      where: { id: { notIn: activeIds }, isActive: true },
      data: { isActive: false },
    });
    return result.count;
  }

  findAllActive(): Promise<Project[]> {
    return this.prisma.project.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  }

  findById(id: string): Promise<Project | null> {
    return this.prisma.project.findUnique({ where: { id } });
  }

  findByName(name: string): Promise<Project | null> {
    return this.prisma.project.findUnique({ where: { name } });
  }

  countActive(): Promise<number> {
    return this.prisma.project.count({ where: { isActive: true } });
  }

  count(): Promise<number> {
    return this.prisma.project.count();
  }

  async lastSyncAt(): Promise<Date | null> {
    const latest = await this.prisma.project.findFirst({
      where: { lastSyncedAt: { not: null } },
      orderBy: { lastSyncedAt: 'desc' },
      select: { lastSyncedAt: true },
    });
    return latest?.lastSyncedAt ?? null;
  }
}
