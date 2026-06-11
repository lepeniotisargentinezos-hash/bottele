import { describe, expect, it } from 'vitest';
import {
  AppError,
  NotificationError,
  VercelApiError,
  toErrorMessage,
} from '../../src/utils/errors';

describe('toErrorMessage', () => {
  it('extrai mensagem de Error', () => {
    expect(toErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('converte valores não-Error para string', () => {
    expect(toErrorMessage('texto')).toBe('texto');
    expect(toErrorMessage(42)).toBe('42');
  });
});

describe('hierarquia de erros', () => {
  it('AppError carrega código e status', () => {
    const error = new AppError('falhou', 'MY_CODE', 400);
    expect(error.code).toBe('MY_CODE');
    expect(error.statusCode).toBe(400);
    expect(error.name).toBe('AppError');
  });

  it('VercelApiError preserva endpoint e status HTTP', () => {
    const error = new VercelApiError('api caiu', 500, '/v9/projects');
    expect(error.httpStatus).toBe(500);
    expect(error.endpoint).toBe('/v9/projects');
    expect(error).toBeInstanceOf(AppError);
  });

  it('NotificationError é um AppError', () => {
    expect(new NotificationError('telegram fora')).toBeInstanceOf(AppError);
  });
});
