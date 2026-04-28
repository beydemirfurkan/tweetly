import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AdminTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const token = this.config.get<string>('ADMIN_TOKEN');
    if (!token) throw new UnauthorizedException('Admin token not configured');

    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const bearer = req.headers['authorization'] as string | undefined;
    const xToken = req.headers['x-admin-token'] as string | undefined;

    if (bearer === `Bearer ${token}` || xToken === token) return true;
    throw new UnauthorizedException('Invalid admin token');
  }
}
