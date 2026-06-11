import type { NotificationType, Prisma, PrismaClient } from '@prisma/client';

export interface RecordNotificationInput {
  chatId: bigint;
  type: NotificationType;
  payload?: Prisma.InputJsonValue;
  success: boolean;
  error?: string;
}

export class NotificationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  record(input: RecordNotificationInput) {
    return this.prisma.notification.create({
      data: {
        chatId: input.chatId,
        type: input.type,
        payload: input.payload,
        success: input.success,
        error: input.error ?? null,
      },
    });
  }

  countSince(since: Date): Promise<number> {
    return this.prisma.notification.count({ where: { sentAt: { gte: since } } });
  }
}
