import { HttpException } from '@nestjs/common';

/** Domain error with a stable machine code (translated in the client). */
export class AppError extends HttpException {
  constructor(
    readonly code: string,
    status: number,
    title?: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super({ code, title: title ?? code }, status);
  }
}

export const Errors = {
  unauthorized: (code = 'UNAUTHORIZED') => new AppError(code, 401, 'Unauthorized'),
  forbidden: (code = 'FORBIDDEN') => new AppError(code, 403, 'Forbidden'),
  notFound: (what: string) =>
    new AppError(`${what.toUpperCase()}_NOT_FOUND`, 404, `${what} not found`),
  conflict: (code: string, title?: string) => new AppError(code, 409, title),
  unprocessable: (code: string, title?: string) => new AppError(code, 422, title),
};
