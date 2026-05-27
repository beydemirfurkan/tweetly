import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ACTION_TYPES, type ActionType } from '@domain/types/action.types';
import { ApiExcludeController, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { AdminTokenGuard } from './admin-token.guard';
import { AdminApiService } from './admin-api.service';
import { SettingsService } from '@/settings/settings.service';
import { UsersService } from '@/auth/users.service';
import { MagicLinkService } from '@/auth/magic-link.service';
import { CircuitBreakerService } from '@/action-engine/circuit-breaker.service';
import { BrowserDiagnosticsService } from '@/x-automation/browser/browser-diagnostics.service';
import { BrowserProbeService } from '@/x-automation/browser/browser-probe.service';
import { XDirectReadService } from '@/x-automation/x-direct';

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

@ApiExcludeController()
@ApiTags('admin')
@Controller('admin')
@UseGuards(AdminTokenGuard)
export class AdminApiController {
  private readonly log = new Logger(AdminApiController.name);

  constructor(
    private readonly service: AdminApiService,
    private readonly settings: SettingsService,
    private readonly users: UsersService,
    private readonly magicLinks: MagicLinkService,
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly browserDiagnostics: BrowserDiagnosticsService,
    private readonly browserProbe: BrowserProbeService,
    private readonly xDirect: XDirectReadService,
  ) {}

  // ── Dead-letter (DLQ) ─────────────────────────────────────────────────

  @Get('dead-letter')
  @ApiOperation({
    summary: 'List dead actions across all action types (admin DLQ view)',
    description:
      'Optional `?type=post` to filter to one table. Capped at 200 rows. ' +
      'Use POST /admin/dead-letter/:type/:id/replay to requeue a row.',
  })
  async listDeadLetter(
    @Query('type') type?: string,
    @Query('limit') limitStr?: string,
  ) {
    const limit = Math.min(Math.max(1, parseInt(limitStr ?? '50', 10)), 200);
    const t = this.parseTypeOptional(type);
    const rows = await this.service.listDeadActions(t, limit);
    return { count: rows.length, rows };
  }

  @Post('dead-letter/:type/:id/replay')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Requeue a dead action (admin override, no per-user ownership check)',
  })
  async replayDeadLetter(
    @Param('type') typeParam: string,
    @Param('id') id: string,
  ) {
    const type = this.parseType(typeParam);
    const ok = await this.service.replayAction(type, id);
    if (!ok) throw new NotFoundException(`Dead action ${id} not found or not replayable`);
    // Audit: structured log so the SIEM/log pipeline picks it up. We don't
    // have a dedicated audit table yet — when one lands, route this through
    // it (the message format here is the contract).
    this.log.warn(
      `audit: admin replayed dead action — type=${type} id=${id} at=${new Date().toISOString()}`,
    );
    return { ok: true, type, id, status: 'pending' };
  }

  private parseTypeOptional(raw?: string): ActionType | undefined {
    if (!raw) return undefined;
    return this.parseType(raw);
  }

  private parseType(raw: string): ActionType {
    if (!ACTION_TYPES.includes(raw as ActionType)) {
      throw new BadRequestException(`Unknown action type: ${raw}`);
    }
    return raw as ActionType;
  }

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

  @Post('actions/dead/archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive dead actions as cancelled without deleting audit rows' })
  async archiveDeadActions() {
    const byType = await this.service.archiveDeadActions();
    const totalArchived = byType.reduce((sum, row) => sum + row.archived, 0);
    return { ok: true, totalArchived, byType };
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
    this.assertDebugEndpointsEnabled();
    return this.browserDiagnostics.getDiagnostics();
  }

  @Get('browser/probe')
  @ApiOperation({ summary: 'Probe Patchright launch/release without navigation' })
  async probeBrowser(@Query('account') accountId?: string) {
    this.assertDebugEndpointsEnabled();
    return this.browserProbe.probeLaunch(accountId?.trim() || undefined);
  }

  @Get('browser/navigate-probe')
  @ApiOperation({ summary: 'Probe Patchright navigation to an x.com URL' })
  async probeBrowserNavigation(
    @Query('url') url?: string,
    @Query('account') accountId?: string,
    @Query('waitMs') waitMs?: string,
    @Query('selector') selector?: string,
    @Query('extractTweets') extractTweets?: string,
  ) {
    this.assertDebugEndpointsEnabled();
    const targetUrl = url?.trim() || 'https://x.com';
    if (!targetUrl.startsWith('https://x.com/')) {
      throw new BadRequestException('url must start with https://x.com/');
    }

    return this.browserProbe.probeNavigate(targetUrl, accountId?.trim() || undefined, {
      waitMs: waitMs ? Number(waitMs) : undefined,
      selector,
      extractTweets: extractTweets === 'true',
    });
  }

  @Get('x-direct/users/:handle/tweets')
  @ApiOperation({ summary: 'Admin-only XDirect getUserTweets probe' })
  async probeXDirectUserTweets(
    @Param('handle') handle: string,
    @Query('account') accountId?: string,
    @Query('limit') limitStr?: string,
  ) {
    this.assertDebugEndpointsEnabled();
    const limit = Math.min(Number(limitStr ?? 3), 10);
    return this.xDirect.getUserTweets(handle, limit, accountId?.trim() || undefined);
  }

  private assertDebugEndpointsEnabled(): void {
    if (process.env.ADMIN_DEBUG_ENDPOINTS_ENABLED !== 'true') {
      throw new NotFoundException('Not found');
    }
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
