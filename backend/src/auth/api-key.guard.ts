import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { ApiKeyService } from './api-key.service';

export interface AuthContext {
  userId: string;
  apiKeyId: string;
  scopes: string[];
}

export type AuthedRequest = Request & { tweetlyAuth: AuthContext };

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeys: ApiKeyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = extractToken(req);
    if (!token) throw new UnauthorizedException('API key missing');

    const row = await this.apiKeys.verify(token);
    if (!row) throw new UnauthorizedException('Invalid API key');

    (req as AuthedRequest).tweetlyAuth = {
      userId: row.userId,
      apiKeyId: row.id,
      scopes: row.scopes ?? [],
    };
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
