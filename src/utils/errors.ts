export class AppError extends Error {
  constructor(
    message: string,
    readonly code: string = 'INTERNAL_ERROR',
    readonly statusCode: number = 500,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class VercelApiError extends AppError {
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly endpoint: string,
  ) {
    super(message, 'VERCEL_API_ERROR', 502);
  }
}

export class NotificationError extends AppError {
  constructor(message: string) {
    super(message, 'NOTIFICATION_ERROR', 502);
  }
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
