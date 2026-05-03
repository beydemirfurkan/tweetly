import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { ApiKeyService } from './api-key.service';
import { REQUIRES_SCOPE_KEY, type ApiScope } from './requires-scope.decorator';
import { OAUTH_CHALLENGE_KEY } from '@/oauth/oauth-challenge.decorator';
import { backendBaseUrl } from '@/oauth/oauth-urls';
import { RequestContext } from '@common/context';

export interface AuthContext {
  userId: string;
  apiKeyId: string;
  scopes: string[];
}

export type AuthedRequest = Request & { tweetlyAuth: AuthContext };

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly apiKeys: ApiKeyService,
    private readonly reflector: Reflector,
    private readonly requestContext: RequestContext,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    const oauthChallenge = this.reflector.getAllAndOverride<boolean | undefined>(
      OAUTH_CHALLENGE_KEY,
      [context.getHandler(), context.getClass()],
    );

    const token = extractToken(req);
    if (!token) {
      if (oauthChallenge) {
        res.setHeader(
          'WWW-Authenticate',
          `Bearer resource_metadata="${backendBaseUrl()}/.well-known/oauth-protected-resource"`,
        );
      }
      throw new UnauthorizedException('API key missing');
    }

    const row = await this.apiKeys.verify(token);
    if (!row) {
      if (oauthChallenge) {
        res.setHeader(
          'WWW-Authenticate',
          `Bearer resource_metadata="${backendBaseUrl()}/.well-known/oauth-protected-resource", error="invalid_token"`,
        );
      }
      throw new UnauthorizedException('Invalid API key');
    }

    const required = this.reflector.getAllAndOverride<ApiScope | undefined>(REQUIRES_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const granted = row.scopes ?? [];
    if (required && !grantsScope(granted, required)) {
      throw new ForbiddenException(
        `API key is missing required scope: ${required}. Granted: ${granted.join(',') || '(none)'}`,
      );
    }

    (req as AuthedRequest).tweetlyAuth = {
      userId: row.userId,
      apiKeyId: row.id,
      scopes: granted,
    };
    this.requestContext.setUserId(row.userId);
    this.apiKeys.touchLastUsed(row.id).catch(() => undefined);
    return true;
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
  if (required === 'read' && granted.includes('write')) return true;
  return false;
}
