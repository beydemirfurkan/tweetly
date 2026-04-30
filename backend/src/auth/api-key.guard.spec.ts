import { UnauthorizedException } from '@nestjs/common';
import { ApiKeyGuard, getAuthContext } from './api-key.guard';
import type { ApiKeyEntity } from '../persistence/entities/api-key.entity';

function makeContext(headers: Record<string, string | undefined>) {
  const req: { headers: Record<string, string | undefined>; tweetlyAuth?: unknown } = { headers };
  return {
    req,
    ctx: {
      switchToHttp: () => ({ getRequest: () => req }),
    } as any,
  };
}

describe('ApiKeyGuard', () => {
  it('throws when authorization header missing', async () => {
    const apiKeys = { verify: jest.fn(), touchLastUsed: jest.fn() } as any;
    const guard = new ApiKeyGuard(apiKeys);
    const { ctx } = makeContext({});
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('throws when bearer token absent', async () => {
    const apiKeys = { verify: jest.fn(), touchLastUsed: jest.fn() } as any;
    const guard = new ApiKeyGuard(apiKeys);
    const { ctx } = makeContext({ authorization: 'Basic something' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('throws when key not verified', async () => {
    const apiKeys = { verify: jest.fn().mockResolvedValue(null), touchLastUsed: jest.fn() } as any;
    const guard = new ApiKeyGuard(apiKeys);
    const { ctx } = makeContext({ authorization: 'Bearer tk_xyz' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('attaches AuthContext to request when valid', async () => {
    const row = { id: 'k-1', userId: 'u-1', scopes: ['*'] } as ApiKeyEntity;
    const apiKeys = {
      verify: jest.fn().mockResolvedValue(row),
      touchLastUsed: jest.fn().mockResolvedValue(undefined),
    } as any;
    const guard = new ApiKeyGuard(apiKeys);
    const { ctx, req } = makeContext({ authorization: 'Bearer tk_xyz' });
    const ok = await guard.canActivate(ctx);
    expect(ok).toBe(true);
    expect(getAuthContext(req as any)).toEqual({
      userId: 'u-1',
      apiKeyId: 'k-1',
      scopes: ['*'],
    });
  });
});
