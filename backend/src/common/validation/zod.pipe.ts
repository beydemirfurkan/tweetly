import { Injectable, PipeTransform } from '@nestjs/common';
import { z } from 'zod';
import { ApplicationException } from '@common/exceptions';
import { HttpStatus } from '@nestjs/common';

/**
 * Validates request bodies (or any pipeable value) against a Zod schema.
 *
 *   @UsePipes(new ZodValidationPipe(MyBodySchema))
 *   @Post('foo') foo(@Body() body: z.infer<typeof MyBodySchema>) { ... }
 *
 * On parse failure, throws ApplicationException so the GlobalExceptionFilter
 * shapes the response uniformly and the client sees field-scoped issues.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: z.ZodType<T>) {}

  transform(value: unknown): T {
    const parsed = this.schema.safeParse(value);
    if (parsed.success) return parsed.data;

    throw new ApplicationException(formatZodIssue(parsed.error), {
      errorClass: 'permanent',
      status: HttpStatus.BAD_REQUEST,
      code: 'validation_error',
      cause: parsed.error,
    });
  }
}

function formatZodIssue(err: z.ZodError): string {
  const first = err.issues[0];
  if (!first) return 'validation failed';
  const path = first.path.length ? first.path.join('.') : '(root)';
  return `${path}: ${first.message}`;
}
