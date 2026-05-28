import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { AdminUserGuard } from '../admin-user.guard';
import type { UsersService } from '@/auth/users.service';
import type { AppConfigService } from '@/config/app-config.service';

function fakeConfig(envEmails: string | undefined): AppConfigService {
  // The guard only ever calls `getString('AI_COPILOT_ADMIN_EMAILS', '')`.
  return {
    getString: jest.fn((key: string, fallback: string) =>
      key === 'AI_COPILOT_ADMIN_EMAILS' ? (envEmails ?? fallback) : fallback,
    ),
  } as unknown as AppConfigService;
}

function createGuard(opts: {
  envEmails: string | undefined;
  user: { id: string; email: string } | null;
  authUserId?: string;
}): { guard: AdminUserGuard; users: jest.Mocked<UsersService>; config: AppConfigService } {
  const users = {
    findById: jest.fn().mockResolvedValue(opts.user),
  } as unknown as jest.Mocked<UsersService>;
  const config = fakeConfig(opts.envEmails);
  const guard = new AdminUserGuard(users, config);
  return { guard, users, config };
}

function createContext(userId = 'user-1'): ExecutionContext {
  // The guard reads auth via getAuthContext(req) which looks for the
  // `tweetlyAuth` property set by ApiKeyGuard. Mirror that shape.
  const req = { tweetlyAuth: { userId, scopes: [], apiKeyId: 'k-1' } };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('AdminUserGuard', () => {
  it('throws Forbidden when the allow-list env var is unset', async () => {
    const { guard } = createGuard({
      envEmails: undefined,
      user: { id: 'user-1', email: 'alice@example.com' },
    });
    await expect(guard.canActivate(createContext())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws Forbidden when the allow-list env var is empty/whitespace', async () => {
    const { guard } = createGuard({
      envEmails: '   ',
      user: { id: 'user-1', email: 'alice@example.com' },
    });
    await expect(guard.canActivate(createContext())).rejects.toThrow(/Admin access required/);
  });

  it('allows the request when the user email is in the allow-list', async () => {
    const { guard } = createGuard({
      envEmails: 'alice@example.com,bob@example.com',
      user: { id: 'user-1', email: 'alice@example.com' },
    });
    await expect(guard.canActivate(createContext())).resolves.toBe(true);
  });

  it('matches emails case-insensitively', async () => {
    const { guard } = createGuard({
      envEmails: 'alice@EXAMPLE.com',
      user: { id: 'user-1', email: 'ALICE@example.com' },
    });
    await expect(guard.canActivate(createContext())).resolves.toBe(true);
  });

  it('throws Forbidden when the user email is not in the allow-list', async () => {
    const { guard } = createGuard({
      envEmails: 'alice@example.com',
      user: { id: 'user-1', email: 'mallory@example.com' },
    });
    await expect(guard.canActivate(createContext())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws Forbidden when the user row is missing (deleted between auth and guard)', async () => {
    const { guard } = createGuard({
      envEmails: 'alice@example.com',
      user: null,
    });
    await expect(guard.canActivate(createContext())).rejects.toThrow(/User not found/);
  });

  it('parses comma + whitespace + trailing-empty entries without false matches', async () => {
    const { guard } = createGuard({
      envEmails: '  alice@example.com  , , bob@example.com,',
      user: { id: 'user-1', email: 'bob@example.com' },
    });
    await expect(guard.canActivate(createContext())).resolves.toBe(true);
  });

  it('re-reads AI_COPILOT_ADMIN_EMAILS on every call (config rotated mid-process)', async () => {
    // Drive the config response from a single mutable ref so the second
    // request observes the rotated allow-list.
    let current = 'alice@example.com';
    const users = {
      findById: jest.fn().mockResolvedValue({ id: 'user-1', email: 'alice@example.com' }),
    } as unknown as jest.Mocked<UsersService>;
    const config = {
      getString: jest.fn((key: string, fallback: string) =>
        key === 'AI_COPILOT_ADMIN_EMAILS' ? current : fallback,
      ),
    } as unknown as AppConfigService;
    const guard = new AdminUserGuard(users, config);

    await expect(guard.canActivate(createContext())).resolves.toBe(true);
    current = 'someone-else@example.com';
    await expect(guard.canActivate(createContext())).rejects.toBeInstanceOf(ForbiddenException);
    expect(users.findById).toHaveBeenCalledTimes(2);
  });
});
