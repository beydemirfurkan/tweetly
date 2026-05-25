import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { AdminUserGuard } from './admin-user.guard';
import type { UsersService } from '@/auth/users.service';

function createGuard(opts: {
  envEmails: string | undefined;
  user: { id: string; email: string } | null;
  authUserId?: string;
}): { guard: AdminUserGuard; users: jest.Mocked<UsersService> } {
  if (opts.envEmails === undefined) {
    delete process.env.AI_COPILOT_ADMIN_EMAILS;
  } else {
    process.env.AI_COPILOT_ADMIN_EMAILS = opts.envEmails;
  }
  const users = {
    findById: jest.fn().mockResolvedValue(opts.user),
  } as unknown as jest.Mocked<UsersService>;
  const guard = new AdminUserGuard(users);
  return { guard, users };
}

function createContext(userId = 'user-1'): ExecutionContext {
  // The guard reads auth via getAuthContext(req) which looks for the
  // `tweetlyAuth` property set by ApiKeyGuard. Mirror that shape.
  const req = { tweetlyAuth: { userId, scopes: [], apiKeyId: 'k-1' } };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

const ORIGINAL_ENV = process.env.AI_COPILOT_ADMIN_EMAILS;

describe('AdminUserGuard', () => {
  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.AI_COPILOT_ADMIN_EMAILS;
    } else {
      process.env.AI_COPILOT_ADMIN_EMAILS = ORIGINAL_ENV;
    }
  });

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

  it('re-reads AI_COPILOT_ADMIN_EMAILS on every call (env change between requests)', async () => {
    const { guard, users } = createGuard({
      envEmails: 'alice@example.com',
      user: { id: 'user-1', email: 'alice@example.com' },
    });
    // First call: allowed.
    await expect(guard.canActivate(createContext())).resolves.toBe(true);
    // Env changes (e.g. operator rotates the allow-list mid-process).
    process.env.AI_COPILOT_ADMIN_EMAILS = 'someone-else@example.com';
    await expect(guard.canActivate(createContext())).rejects.toBeInstanceOf(ForbiddenException);
    expect(users.findById).toHaveBeenCalledTimes(2);
  });
});
