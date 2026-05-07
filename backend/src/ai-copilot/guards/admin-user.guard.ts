import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { UsersService } from '@/auth/users.service';
import type { Request } from 'express';
import { getAuthContext } from '@/auth/api-key.guard';

function loadAdminEmails(): Set<string> {
  return new Set(
    (process.env.AI_COPILOT_ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

@Injectable()
export class AdminUserGuard implements CanActivate {
  constructor(private readonly users: UsersService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const auth = getAuthContext(req);

    const user = await this.users.findById(auth.userId);
    if (!user) throw new ForbiddenException('User not found');

    const allowed = loadAdminEmails();
    if (allowed.size === 0 || !allowed.has(user.email.toLowerCase())) {
      throw new ForbiddenException('Admin access required');
    }

    return true;
  }
}
