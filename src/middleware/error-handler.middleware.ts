import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../utils/errors';
import type { Logger } from '../utils/logger';

/** Tratamento global de erros do servidor HTTP: nunca vaza stack trace ou segredos. */
export function createHttpErrorHandler(logger: Logger) {
  return (error: FastifyError, request: FastifyRequest, reply: FastifyReply): void => {
    const statusCode = error instanceof AppError ? error.statusCode : (error.statusCode ?? 500);
    const code = error instanceof AppError ? error.code : 'INTERNAL_ERROR';

    logger.error(
      { method: request.method, url: request.url, statusCode, error: error.message },
      'Erro na requisição HTTP',
    );

    void reply.status(statusCode).send({
      error: code,
      message: statusCode >= 500 ? 'Erro interno' : error.message,
    });
  };
}
