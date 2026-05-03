import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ApiKeyService } from './api-key.service';
import { ClerkTokenService } from './clerk-token.service';
import { UsersService } from './users.service';
import { REQUIRES_SCOPE_KEY, type ApiScope } from './requires-scope.decorator';
import { RequestContext } from '@common/context';

const TK_PREFIX = 'tk_';

export interface AuthContext {
  userId: string;
  apiKeyId: string | null;
  scopes: string[];
}

export type AuthedRequest = Request & { tweetlyAuth: AuthContext };

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly apiKeys: ApiKeyService,
    private readonly reflector: Reflector,
    private readonly requestContext: RequestContext,
    private readonly clerkTokens: ClerkTokenService,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = extractToken(req);
    if (!token) throw new UnauthorizedException('Bearer token missing');

    const required = this.reflector.getAllAndOverride<ApiScope | undefined>(REQUIRES_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const auth = token.startsWith(TK_PREFIX)
      ? await this.authenticateApiKey(token, required)
      : await this.authenticateClerkSession(token);

    (req as AuthedRequest).tweetlyAuth = auth;
    this.requestContext.setUserId(auth.userId);
    return true;
  }

  private async authenticateApiKey(token: string, required: ApiScope | undefined): Promise<AuthContext> {
    const row = await this.apiKeys.verify(token);
    if (!row) throw new UnauthorizedException('Invalid API key');

    const granted = row.scopes ?? [];
    if (required && !grantsScope(granted, required)) {
      throw new ForbiddenException(
        `API key is missing required scope: ${required}. Granted: ${granted.join(',') || '(none)'}`,
      );
    }

    this.apiKeys.touchLastUsed(row.id).catch(() => undefined);
    return { userId: row.userId, apiKeyId: row.id, scopes: granted };
  }

  private async authenticateClerkSession(token: string): Promise<AuthContext> {
    if (!this.clerkTokens.isConfigured()) {
      throw new UnauthorizedException('Clerk auth not configured');
    }
    const verified = await this.clerkTokens.verifySessionToken(token);
    if (!verified) throw new UnauthorizedException('Invalid session token');

    const user = await this.users.resolveClerkIdentity(verified.clerkUserId, verified.email);
    if (user.status !== 'active') throw new UnauthorizedException('Account suspended');

    // Clerk-authenticated panel sessions are always full-scope.
    return { userId: user.id, apiKeyId: null, scopes: ['*'] };
  }
}

export function getAuthContext(req: Request): AuthContext {
  const ctx = (req as AuthedRequest).tweetlyAuth;
  if (!ctx) throw new UnauthorizedException('Auth context missing');
  return ctx;
}

function extractToken(req: Request): string | null {
  const header = req.headers['authorization'];
  if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim() || null;
  }
  return null;
}

function grantsScope(granted: string[], required: ApiScope): boolean {
  if (granted.includes('*')) return true;
  if (granted.includes(required)) return true;
  // write implies read
  if (required === 'read' && granted.includes('write')) return true;
  return false;
}
