import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { SettingsService } from '@/settings/settings.service';

@Injectable()
export class AdminTokenGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const token = await this.resolveAdminToken();
    if (!token) throw new UnauthorizedException('Admin token not configured');

    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const bearer = req.headers['authorization'];
    const xToken = req.headers['x-admin-token'];

    if (timingSafeStringEqual(bearer, `Bearer ${token}`) || timingSafeStringEqual(xToken, token)) return true;
    throw new UnauthorizedException('Invalid admin token');
  }

  private async resolveAdminToken(): Promise<string | undefined> {
    const stored = await this.settings.get<string>('secrets.admin_token', '');
    if (stored) return stored;
    return this.config.get<string>('BOOTSTRAP_ADMIN_TOKEN') ?? this.config.get<string>('ADMIN_TOKEN');
  }
}

function timingSafeStringEqual(actual: string | string[] | undefined, expected: string): boolean {
  if (typeof actual !== 'string') return false;

  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;

  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}
