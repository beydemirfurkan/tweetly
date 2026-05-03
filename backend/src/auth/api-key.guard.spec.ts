import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyGuard, getAuthContext } from './api-key.guard';
import type { ApiKeyEntity } from '@persistence/entities/api-key.entity';

function makeContext(headers: Record<string, string | undefined>) {
  const req: { headers: Record<string, string | undefined>; tweetlyAuth?: unknown } = { headers };
  return {
    req,
    ctx: {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => () => undefined,
      getClass: () => class C {},
    } as any,
  };
}

function makeReflector(requiredScope?: string): Reflector {
  return {
    getAllAndOverride: jest.fn().mockReturnValue(requiredScope),
  } as unknown as Reflector;
}

describe('ApiKeyGuard', () => {
  it('throws when authorization header missing', async () => {
    const apiKeys = { verify: jest.fn(), touchLastUsed: jest.fn() } as any;
    const guard = new ApiKeyGuard(apiKeys, makeReflector());
    const { ctx } = makeContext({});
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('throws when bearer token absent', async () => {
    const apiKeys = { verify: jest.fn(), touchLastUsed: jest.fn() } as any;
    const guard = new ApiKeyGuard(apiKeys, makeReflector());
    const { ctx } = makeContext({ authorization: 'Basic something' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('throws when key not verified', async () => {
    const apiKeys = { verify: jest.fn().mockResolvedValue(null), touchLastUsed: jest.fn() } as any;
    const guard = new ApiKeyGuard(apiKeys, makeReflector());
    const { ctx } = makeContext({ authorization: 'Bearer tk_xyz' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('attaches AuthContext to request when valid', async () => {
    const row = { id: 'k-1', userId: 'u-1', scopes: ['*'] } as ApiKeyEntity;
    const apiKeys = {
      verify: jest.fn().mockResolvedValue(row),
      touchLastUsed: jest.fn().mockResolvedValue(undefined),
    } as any;
    const guard = new ApiKeyGuard(apiKeys, makeReflector());
    const { ctx, req } = makeContext({ authorization: 'Bearer tk_xyz' });
    const ok = await guard.canActivate(ctx);
    expect(ok).toBe(true);
    expect(getAuthContext(req as any)).toEqual({
      userId: 'u-1',
      apiKeyId: 'k-1',
      scopes: ['*'],
    });
  });

  describe('scope enforcement', () => {
    function setup(rowScopes: string[], requiredScope?: string) {
      const row = { id: 'k', userId: 'u', scopes: rowScopes } as ApiKeyEntity;
      const apiKeys = {
        verify: jest.fn().mockResolvedValue(row),
        touchLastUsed: jest.fn().mockResolvedValue(undefined),
      } as any;
      const guard = new ApiKeyGuard(apiKeys, makeReflector(requiredScope));
      const { ctx } = makeContext({ authorization: 'Bearer tk_x' });
      return { guard, ctx };
    }

    it('passes when route has no scope requirement', async () => {
      const { guard, ctx } = setup(['read'], undefined);
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('passes when key has wildcard *', async () => {
      const { guard, ctx } = setup(['*'], 'write');
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('passes when scope exactly matches', async () => {
      const { guard, ctx } = setup(['read'], 'read');
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('passes when write key calls a read endpoint', async () => {
      const { guard, ctx } = setup(['write'], 'read');
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('rejects when read-only key calls a write endpoint', async () => {
      const { guard, ctx } = setup(['read'], 'write');
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('rejects when scope list is empty', async () => {
      const { guard, ctx } = setup([], 'read');
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });
  });
});
