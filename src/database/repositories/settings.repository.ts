import type { Prisma, PrismaClient } from '@prisma/client';

export class SettingsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async get<T>(key: string): Promise<T | null> {
    const setting = await this.prisma.setting.findUnique({ where: { key } });
    return setting ? (setting.value as T) : null;
  }

  async set(key: string, value: Prisma.InputJsonValue): Promise<void> {
    await this.prisma.setting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }
}
