import { ArgumentsHost, Catch, HttpException, Logger, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { TradingError } from '@brand/engine';
import { AppError } from './errors.js';

/** Maps every error to RFC 9457 application/problem+json with a stable `code`. */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') throw exception;
    const res = host.switchToHttp().getResponse<Response>();
    const body = this.toProblem(exception);
    res.status(body.status).type('application/problem+json').json(body);
  }

  private toProblem(e: unknown): {
    type: string;
    title: string;
    status: number;
    code: string;
    errors?: unknown;
  } {
    if (e instanceof AppError) {
      return {
        type: 'about:blank',
        title: (e.getResponse() as { title: string }).title,
        status: e.getStatus(),
        code: e.code,
        ...e.extra,
      };
    }
    if (e instanceof TradingError) {
      return { type: 'about:blank', title: 'Order rejected', status: 422, code: e.code };
    }
    if (e instanceof HttpException) {
      const status = e.getStatus();
      const r = e.getResponse();
      const message =
        typeof r === 'object' && r !== null && 'message' in r
          ? (r as { message: unknown }).message
          : undefined;
      if (status === 400 && Array.isArray(message)) {
        return {
          type: 'about:blank',
          title: 'Validation failed',
          status,
          code: 'VALIDATION_ERROR',
          errors: message,
        };
      }
      if (status === 429)
        return { type: 'about:blank', title: 'Too many requests', status, code: 'RATE_LIMITED' };
      return {
        type: 'about:blank',
        title: e.message,
        status,
        code: status === 404 ? 'NOT_FOUND' : 'HTTP_ERROR',
      };
    }
    this.logger.error(e instanceof Error ? e.stack : String(e));
    return {
      type: 'about:blank',
      title: 'Internal server error',
      status: 500,
      code: 'INTERNAL_ERROR',
    };
  }
}
