import type { PrismaClient, User } from '@prisma/client';

export interface UpsertUserInput {
  telegramId: bigint;
  chatId: bigint;
  username: string | null;
  firstName: string | null;
}

export class UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  upsertFromTelegram(input: UpsertUserInput): Promise<User> {
    return this.prisma.user.upsert({
      where: { telegramId: input.telegramId },
      create: input,
      update: {
        chatId: input.chatId,
        username: input.username,
        firstName: input.firstName,
      },
    });
  }

  findByTelegramId(telegramId: bigint): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { telegramId } });
  }
}
