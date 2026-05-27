jest.mock('crypto', () => {
  const actual = jest.requireActual<typeof import('crypto')>('crypto');
  return { ...actual, timingSafeEqual: jest.fn(actual.timingSafeEqual) };
});

import type { ConfigService } from '@nestjs/config';
import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import * as crypto from 'crypto';
import { AdminTokenGuard } from '../admin-token.guard';
import type { SettingsService } from '@/settings/settings.service';

describe('AdminTokenGuard', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  function createGuard(headers: Record<string, string | undefined>, storedToken = '', bootstrapToken = ''): AdminTokenGuard {
    const config = {
      get: jest.fn((key: string) => (key === 'BOOTSTRAP_ADMIN_TOKEN' ? bootstrapToken : undefined)),
    } as unknown as ConfigService;
    const settings = {
      get: jest.fn().mockResolvedValue(storedToken),
    } as unknown as SettingsService;
    const guard = new AdminTokenGuard(config, settings);
    jest.spyOn(guard, 'canActivate');
    return Object.assign(guard, { context: createContext(headers) });
  }

  it('uses the database admin token when configured', async () => {
    const timingSafeEqual = crypto.timingSafeEqual as jest.MockedFunction<typeof crypto.timingSafeEqual>;
    const guard = createGuard({ authorization: 'Bearer db-token' }, 'db-token', 'bootstrap-token');

    await expect(guard.canActivate((guard as unknown as { context: ExecutionContext }).context)).resolves.toBe(true);
    expect(timingSafeEqual).toHaveBeenCalledWith(
      Buffer.from('Bearer db-token'),
      Buffer.from('Bearer db-token'),
    );
  });

  it('falls back to bootstrap token only when database token is missing', async () => {
    const timingSafeEqual = crypto.timingSafeEqual as jest.MockedFunction<typeof crypto.timingSafeEqual>;
    const guard = createGuard({ 'x-admin-token': 'bootstrap-token' }, '', 'bootstrap-token');

    await expect(guard.canActivate((guard as unknown as { context: ExecutionContext }).context)).resolves.toBe(true);
    expect(timingSafeEqual).toHaveBeenCalledWith(
      Buffer.from('bootstrap-token'),
      Buffer.from('bootstrap-token'),
    );
  });

  it('rejects the bootstrap token after database token is configured', async () => {
    const guard = createGuard({ 'x-admin-token': 'bootstrap-token' }, 'db-token', 'bootstrap-token');

    await expect(guard.canActivate((guard as unknown as { context: ExecutionContext }).context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects length-mismatched tokens before calling timingSafeEqual', async () => {
    const timingSafeEqual = crypto.timingSafeEqual as jest.MockedFunction<typeof crypto.timingSafeEqual>;
    const guard = createGuard({ authorization: 'Bearer short' }, 'db-token', 'bootstrap-token');

    await expect(guard.canActivate((guard as unknown as { context: ExecutionContext }).context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(timingSafeEqual).not.toHaveBeenCalled();
  });
});

function createContext(headers: Record<string, string | undefined>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}
