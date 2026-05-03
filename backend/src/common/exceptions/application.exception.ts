import { HttpException, HttpStatus } from '@nestjs/common';
import type { ErrorClass } from '@domain/types/action.types';

export interface ApplicationExceptionInit {
  errorClass: ErrorClass;
  status: HttpStatus;
  code: string;
  cause?: unknown;
}

/**
 * Base for thrown errors that map to a stable HTTP response shape and carry the
 * domain `errorClass` used by RetryPolicy / ActionEngine. Subclass per domain
 * concept; do not throw `ApplicationException` directly.
 */
export class ApplicationException extends HttpException {
  readonly errorClass: ErrorClass;
  readonly code: string;

  constructor(message: string, init: ApplicationExceptionInit) {
    super(
      {
        statusCode: init.status,
        code: init.code,
        errorClass: init.errorClass,
        message,
      },
      init.status,
      { cause: init.cause },
    );
    this.errorClass = init.errorClass;
    this.code = init.code;
  }
}
