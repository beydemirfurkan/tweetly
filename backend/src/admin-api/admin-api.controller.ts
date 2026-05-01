import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { AdminTokenGuard } from './admin-token.guard';
import { AdminApiService } from './admin-api.service';
import { SettingsService } from '../settings/settings.service';
import { UsersService } from '../auth/users.service';
import { MagicLinkService } from '../auth/magic-link.service';
import { CircuitBreakerService } from '../action-engine/circuit-breaker.service';
import { XBrowserService } from '../x-automation/browser/x-browser.service';

class SecretUpdateBody {
  @ApiProperty({ required: false, description: 'New persistent admin token (replaces BOOTSTRAP_ADMIN_TOKEN)' })
  adminToken?: string;

  @ApiProperty({ required: false, enum: ['console', 'smtp'], description: 'Mail provider mode' })
  mailProvider?: 'console' | 'smtp';

  @ApiProperty({ required: false, description: 'SMTP server host (e.g. smtp.postmarkapp.com)' })
  smtpHost?: string;

  @ApiProperty({ required: false, description: 'SMTP port (587 for STARTTLS, 465 for SSL)', default: 587 })
  smtpPort?: number;

  @ApiProperty({ required: false, description: 'SMTP auth username' })
  smtpUser?: string;

  @ApiProperty({ required: false, description: 'SMTP auth password / API token' })
  smtpPass?: string;

  @ApiProperty({ required: false, description: 'Use TLS on connect (true for port 465)' })
  smtpSecure?: boolean;

  @ApiProperty({ required: false, description: 'From header for outgoing mail (e.g. "Tweetly <noreply@x.com>")' })
  mailFrom?: string;
}

class CreateUserBody {
  @ApiProperty({ example: 'first-user@yourdomain.com' })
  email?: string;
}

@ApiTags('admin')
@Controller('admin')
@UseGuards(AdminTokenGuard)
export class AdminApiController {
  constructor(
    private readonly service: AdminApiService,
    private readonly settings: SettingsService,
    private readonly users: UsersService,
    private readonly magicLinks: MagicLinkService,
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly browser: XBrowserService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'System-wide queue health (bootstrap-only)' })
  async getStatus() {
    const depth = await this.service.getQueueDepth();
    const totalDead = depth.reduce((s, d) => s + d.dead, 0);
    const totalPending = depth.reduce((s, d) => s + d.pending, 0);
    return {
      ok: totalDead === 0,
      now: new Date().toISOString(),
      queue: {
        byType: depth,
        totalPending,
        totalDead,
      },
    };
  }

  @Get('queue/depth')
  @ApiOperation({ summary: 'System-wide queue depth (bootstrap-only)' })
  async getQueueDepth() {
    return this.service.getQueueDepth();
  }

  @Post('accounts/:accountId/circuit-breaker/clear')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually clear an account circuit-breaker pause' })
  async clearCircuitBreaker(@Param('accountId') accountId: string) {
    const id = accountId.trim();
    if (!id) throw new BadRequestException('accountId is required');

    const before = await this.circuitBreaker.load(id);
    const after = await this.circuitBreaker.clear(id);
    return { ok: true, accountId: id, before, after };
  }

  @Get('secrets')
  @ApiOperation({
    summary: 'Configured secrets snapshot (booleans only, never values)',
    description:
      'Reports whether the persistent admin token and SMTP credentials are configured. ' +
      'Use PUT /admin/secrets to set them — they live in the settings table, never in env.',
  })
  async getSecretsStatus() {
    const [adminToken, mailProvider, smtpHost, smtpUser, smtpPass, mailFrom] = await Promise.all([
      this.settings.get<string>('secrets.admin_token', ''),
      this.settings.get<string>('secrets.mail_provider', ''),
      this.settings.get<string>('secrets.smtp_host', ''),
      this.settings.get<string>('secrets.smtp_user', ''),
      this.settings.get<string>('secrets.smtp_pass', ''),
      this.settings.get<string>('secrets.mail_from', ''),
    ]);
    return {
      adminTokenConfigured: Boolean(adminToken),
      mailProvider: mailProvider || 'console',
      smtp: {
        hostConfigured: Boolean(smtpHost),
        userConfigured: Boolean(smtpUser),
        passConfigured: Boolean(smtpPass),
        fromConfigured: Boolean(mailFrom),
      },
    };
  }

  @Get('browser/diagnostics')
  @ApiOperation({ summary: 'Browser runtime diagnostics (no secrets, no browser launch)' })
  async getBrowserDiagnostics() {
    return this.browser.getDiagnostics();
  }

  @Get('browser/probe')
  @ApiOperation({ summary: 'Probe Patchright launch/release without navigation' })
  async probeBrowser(@Query('account') accountId?: string) {
    return this.browser.probeLaunch(accountId?.trim() || undefined);
  }

  @Put('secrets')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update admin token and / or SMTP credentials',
    description:
      'All fields optional; only the provided ones are written. SMTP credentials live in DB ' +
      'so they can be rotated without redeploying. After updating SMTP fields, the mailer ' +
      'transport is invalidated and rebuilt on the next magic-link send.',
  })
  async updateSecrets(@Body() body: SecretUpdateBody) {
    const writes: Array<[string, unknown]> = [];

    if (typeof body.adminToken === 'string' && body.adminToken.trim()) {
      writes.push(['secrets.admin_token', body.adminToken.trim()]);
    }
    if (body.mailProvider) {
      const v = body.mailProvider.toLowerCase();
      if (v !== 'console' && v !== 'smtp') {
        throw new BadRequestException(`mailProvider must be 'console' or 'smtp'`);
      }
      writes.push(['secrets.mail_provider', v]);
    }
    if (typeof body.smtpHost === 'string') writes.push(['secrets.smtp_host', body.smtpHost.trim()]);
    if (typeof body.smtpPort === 'number') writes.push(['secrets.smtp_port', body.smtpPort]);
    if (typeof body.smtpUser === 'string') writes.push(['secrets.smtp_user', body.smtpUser.trim()]);
    if (typeof body.smtpPass === 'string') writes.push(['secrets.smtp_pass', body.smtpPass]);
    if (typeof body.smtpSecure === 'boolean') writes.push(['secrets.smtp_secure', body.smtpSecure]);
    if (typeof body.mailFrom === 'string') writes.push(['secrets.mail_from', body.mailFrom.trim()]);

    if (writes.length === 0) {
      throw new BadRequestException('No valid secrets provided');
    }

    for (const [key, value] of writes) {
      await this.settings.set(key, value);
    }

    // If anything mail-related changed, drop the cached transporter so the
    // next /auth/request-link rebuilds it from the new DB values.
    if (writes.some(([k]) => k.startsWith('secrets.mail_') || k.startsWith('secrets.smtp_'))) {
      this.magicLinks.invalidateTransport();
    }

    return { ok: true, updated: writes.length };
  }

  @Post('users')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Bootstrap-create a user',
    description:
      'Creates a user record so they can request a magic link. Use this only for the first ' +
      'user; afterwards users self-onboard via /auth/request-link.',
  })
  async createUser(@Body() body: CreateUserBody) {
    const email = body.email?.trim();
    if (!email) throw new BadRequestException('email is required');
    const user = await this.users.findOrCreate(email);
    return { id: user.id, email: user.email, status: user.status, createdAt: user.createdAt };
  }
}
