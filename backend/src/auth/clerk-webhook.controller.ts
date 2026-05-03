import {
  BadRequestException,
  Controller,
  HttpCode,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Webhook, WebhookVerificationError } from 'svix';
import { ApiKeyService } from './api-key.service';
import { UsersService } from './users.service';

interface ClerkWebhookEvent {
  type: string;
  data: {
    id?: string;
    email_addresses?: Array<{ id: string; email_address: string }>;
    primary_email_address_id?: string;
    [k: string]: unknown;
  };
}

@ApiTags('auth')
@Controller('auth')
export class ClerkWebhookController {
  private readonly log = new Logger(ClerkWebhookController.name);
  private readonly secret = process.env.CLERK_WEBHOOK_SECRET ?? '';

  constructor(
    private readonly users: UsersService,
    private readonly apiKeys: ApiKeyService,
  ) {}

  @Post('clerk-webhook')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Clerk webhook receiver (svix-signed)',
    description:
      'Handles user.deleted by suspending the local user and revoking their API keys. ' +
      'user.created/updated are no-ops — those identities are lazy-linked on first JWT auth.',
  })
  async handle(@Req() req: RawBodyRequest<Request>): Promise<{ ok: true; handled: boolean }> {
    if (!this.secret) throw new UnauthorizedException('CLERK_WEBHOOK_SECRET not configured');

    const raw = req.rawBody;
    if (!raw) throw new BadRequestException('Raw body unavailable');

    const headers = {
      'svix-id': stringHeader(req, 'svix-id'),
      'svix-timestamp': stringHeader(req, 'svix-timestamp'),
      'svix-signature': stringHeader(req, 'svix-signature'),
    };

    let event: ClerkWebhookEvent;
    try {
      event = new Webhook(this.secret).verify(raw, headers) as ClerkWebhookEvent;
    } catch (err) {
      if (err instanceof WebhookVerificationError) {
        throw new UnauthorizedException('Invalid webhook signature');
      }
      throw err;
    }

    if (event.type !== 'user.deleted') {
      return { ok: true, handled: false };
    }

    const clerkUserId = event.data.id;
    if (!clerkUserId) return { ok: true, handled: false };

    const user = await this.users.findByClerkUserId(clerkUserId);
    if (!user) {
      this.log.log(`user.deleted for unknown clerk_user_id=${clerkUserId} — ignored`);
      return { ok: true, handled: false };
    }

    await this.users.suspend(user.id);
    const keys = await this.apiKeys.listForUser(user.id);
    await Promise.all(keys.filter((k) => !k.revokedAt).map((k) => this.apiKeys.revoke(k.id, user.id)));
    this.log.log(`Suspended user ${user.id} and revoked ${keys.length} key(s) on Clerk user.deleted`);
    return { ok: true, handled: true };
  }
}

function stringHeader(req: Request, name: string): string {
  const v = req.headers[name];
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v[0] ?? '';
  return '';
}
