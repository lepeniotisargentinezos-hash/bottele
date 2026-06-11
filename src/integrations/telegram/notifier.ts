import { Api } from 'grammy';
import type { NotificationType, Prisma } from '@prisma/client';
import type { NotificationRepository } from '../../database/repositories/notification.repository';
import { truncateMessage } from '../../utils/format';
import { toErrorMessage } from '../../utils/errors';
import type { Logger } from '../../utils/logger';

export interface TelegramNotifierOptions {
  api: Api;
  defaultChatId: string;
  notificationRepository: NotificationRepository;
  logger: Logger;
}

/**
 * Responsável por todo envio proativo de mensagens.
 * Registra cada notificação no banco (auditoria) e nunca
 * deixa uma falha de envio derrubar um job de monitoramento.
 */
export class TelegramNotifier {
  private readonly api: Api;
  private readonly defaultChatId: string;
  private readonly notificationRepository: NotificationRepository;
  private readonly logger: Logger;

  constructor(options: TelegramNotifierOptions) {
    this.api = options.api;
    this.defaultChatId = options.defaultChatId;
    this.notificationRepository = options.notificationRepository;
    this.logger = options.logger;
  }

  /**
   * Envia uma mensagem e retorna o message_id do Telegram,
   * permitindo edições posteriores (mensagens "vivas" de deploy).
   */
  async sendTracked(
    type: NotificationType,
    text: string,
    options: { chatId?: string; payload?: Record<string, unknown> } = {},
  ): Promise<number | null> {
    const chatId = options.chatId ?? this.defaultChatId;
    const message = truncateMessage(text);

    try {
      const sent = await this.api.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      });
      await this.safeRecord(chatId, type, true, options.payload);
      return sent.message_id;
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      this.logger.error({ type, chatId, error: errorMessage }, 'Falha ao enviar notificação');
      await this.safeRecord(chatId, type, false, options.payload, errorMessage);
      return null;
    }
  }

  /** Edita uma mensagem já enviada (usada para atualizar o progresso de deploys). */
  async edit(messageId: number, text: string, chatId?: string): Promise<boolean> {
    const targetChatId = chatId ?? this.defaultChatId;
    try {
      await this.api.editMessageText(targetChatId, messageId, truncateMessage(text), {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      });
      return true;
    } catch (error) {
      this.logger.warn(
        { messageId, error: toErrorMessage(error) },
        'Falha ao editar mensagem; o conteúdo final pode ter sido enviado em nova mensagem',
      );
      return false;
    }
  }

  async send(
    type: NotificationType,
    text: string,
    options: { chatId?: string; payload?: Record<string, unknown> } = {},
  ): Promise<boolean> {
    const chatId = options.chatId ?? this.defaultChatId;
    const message = truncateMessage(text);

    try {
      await this.api.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      });
      await this.safeRecord(chatId, type, true, options.payload);
      return true;
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      this.logger.error({ type, chatId, error: errorMessage }, 'Falha ao enviar notificação');
      await this.safeRecord(chatId, type, false, options.payload, errorMessage);
      return false;
    }
  }

  private async safeRecord(
    chatId: string,
    type: NotificationType,
    success: boolean,
    payload?: Record<string, unknown>,
    error?: string,
  ): Promise<void> {
    try {
      await this.notificationRepository.record({
        chatId: BigInt(chatId),
        type,
        payload: payload as Prisma.InputJsonValue | undefined,
        success,
        error,
      });
    } catch (recordError) {
      this.logger.warn({ error: toErrorMessage(recordError) }, 'Falha ao auditar notificação');
    }
  }
}
