import { z } from 'zod';
import { HttpStatus } from '@nestjs/common';
import { ZodValidationPipe } from './zod.pipe';
import { ApplicationException } from '@common/exceptions';

describe('ZodValidationPipe', () => {
  const schema = z.object({
    name: z.string().min(1),
    age: z.number().int().nonnegative(),
  });
  const pipe = new ZodValidationPipe(schema);

  it('returns parsed value when valid', () => {
    expect(pipe.transform({ name: 'a', age: 5 })).toEqual({ name: 'a', age: 5 });
  });

  it('throws ApplicationException with field path on failure', () => {
    try {
      pipe.transform({ name: '', age: 5 });
      fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ApplicationException);
      const ex = e as ApplicationException;
      expect(ex.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(ex.code).toBe('validation_error');
      expect(ex.errorClass).toBe('permanent');
      expect(ex.message).toMatch(/^name:/);
    }
  });

  it('reports nested path', () => {
    const nested = new ZodValidationPipe(
      z.object({ outer: z.object({ inner: z.string() }) }),
    );
    try {
      nested.transform({ outer: { inner: 5 } });
      fail('expected throw');
    } catch (e) {
      expect((e as ApplicationException).message).toMatch(/^outer\.inner:/);
    }
  });
});
