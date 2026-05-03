import { HttpStatus } from '@nestjs/common';
import { ApplicationException } from './application.exception';

export class LoginValidationError extends ApplicationException {
  constructor(message: string, cause?: unknown) {
    super(message, {
      errorClass: 'permanent',
      status: HttpStatus.BAD_REQUEST,
      code: 'login_validation',
      cause,
    });
    this.name = 'LoginValidationError';
  }
}

export class AccountOwnershipError extends ApplicationException {
  constructor(accountId: string, cause?: unknown) {
    super(`account ${accountId} is not accessible`, {
      errorClass: 'permanent',
      status: HttpStatus.FORBIDDEN,
      code: 'account_ownership',
      cause,
    });
    this.name = 'AccountOwnershipError';
  }
}

export class RateLimitExceeded extends ApplicationException {
  constructor(message: string = 'rate limit exceeded', cause?: unknown) {
    super(message, {
      errorClass: 'rate_limit',
      status: HttpStatus.TOO_MANY_REQUESTS,
      code: 'rate_limit',
      cause,
    });
    this.name = 'RateLimitExceeded';
  }
}

export class IdempotencyConflict extends ApplicationException {
  constructor(key: string, cause?: unknown) {
    super(`idempotency key ${key} conflicts with a prior request`, {
      errorClass: 'permanent',
      status: HttpStatus.CONFLICT,
      code: 'idempotency_conflict',
      cause,
    });
    this.name = 'IdempotencyConflict';
  }
}
