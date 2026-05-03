import type { ConfigService } from '@nestjs/config';
import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { AdminTokenGuard } from './admin-token.guard';
import type { SettingsService } from '@/settings/settings.service';

describe('AdminTokenGuard', () => {
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
    const guard = createGuard({ authorization: 'Bearer db-token' }, 'db-token', 'bootstrap-token');

    await expect(guard.canActivate((guard as unknown as { context: ExecutionContext }).context)).resolves.toBe(true);
  });

  it('falls back to bootstrap token only when database token is missing', async () => {
    const guard = createGuard({ 'x-admin-token': 'bootstrap-token' }, '', 'bootstrap-token');

    await expect(guard.canActivate((guard as unknown as { context: ExecutionContext }).context)).resolves.toBe(true);
  });

  it('rejects the bootstrap token after database token is configured', async () => {
    const guard = createGuard({ 'x-admin-token': 'bootstrap-token' }, 'db-token', 'bootstrap-token');

    await expect(guard.canActivate((guard as unknown as { context: ExecutionContext }).context)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

function createContext(headers: Record<string, string | undefined>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}
