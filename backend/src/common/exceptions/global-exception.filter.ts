import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApplicationException } from './application.exception';

interface ErrorBody {
  statusCode: number;
  code: string;
  errorClass: string;
  message: string;
  path: string;
}

/**
 * Single sink for HTTP errors. Three branches:
 *  - ApplicationException: pass through (status, code, errorClass already set).
 *  - HttpException (raw Nest): wrap shape, errorClass = 'permanent'.
 *  - Anything else: 500, errorClass = 'transient', stack logged.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('GlobalExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const body = this.toBody(exception, req.url);

    if (body.statusCode >= 500) {
      this.logger.error(
        `${req.method} ${req.url} -> ${body.statusCode} ${body.code}: ${body.message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(`${req.method} ${req.url} -> ${body.statusCode} ${body.code}: ${body.message}`);
    }

    res.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown, path: string): ErrorBody {
    if (exception instanceof ApplicationException) {
      const r = exception.getResponse();
      const obj = typeof r === 'object' && r !== null ? (r as Record<string, unknown>) : {};
      return {
        statusCode: exception.getStatus(),
        code: String(obj.code ?? exception.code),
        errorClass: String(obj.errorClass ?? exception.errorClass),
        message: String(obj.message ?? exception.message),
        path,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const r = exception.getResponse();
      const message =
        typeof r === 'string'
          ? r
          : typeof r === 'object' && r !== null && 'message' in r
            ? String((r as { message: unknown }).message)
            : exception.message;
      return {
        statusCode: status,
        code: this.codeForStatus(status),
        errorClass: status === HttpStatus.TOO_MANY_REQUESTS ? 'rate_limit' : 'permanent',
        message,
        path,
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'internal_error',
      errorClass: 'transient',
      message: exception instanceof Error ? exception.message : 'Internal server error',
      path,
    };
  }

  private codeForStatus(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST: return 'bad_request';
      case HttpStatus.UNAUTHORIZED: return 'unauthorized';
      case HttpStatus.FORBIDDEN: return 'forbidden';
      case HttpStatus.NOT_FOUND: return 'not_found';
      case HttpStatus.CONFLICT: return 'conflict';
      case HttpStatus.UNPROCESSABLE_ENTITY: return 'unprocessable';
      case HttpStatus.TOO_MANY_REQUESTS: return 'rate_limit';
      default: return status >= 500 ? 'internal_error' : 'http_error';
    }
  }
}
