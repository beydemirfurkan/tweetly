import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { AdminTokenGuard } from './admin-token.guard';
import { AdminApiService } from './admin-api.service';
import { SettingsService } from '../settings/settings.service';
import { UsersService } from '../auth/users.service';

class SecretUpdateBody {
  @ApiProperty({ required: false, description: 'New persistent admin token (replaces BOOTSTRAP_ADMIN_TOKEN)' })
  adminToken?: string;
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

  @Get('secrets')
  @ApiOperation({ summary: 'Whether persistent admin token is configured' })
  async getSecretsStatus() {
    const adminToken = await this.settings.get<string>('secrets.admin_token', '');
    return { adminTokenConfigured: Boolean(adminToken) };
  }

  @Put('secrets')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set persistent admin token (rotates BOOTSTRAP_ADMIN_TOKEN)' })
  async updateSecrets(@Body() body: SecretUpdateBody) {
    const value = body.adminToken?.trim();
    if (!value) throw new BadRequestException('adminToken is required');
    await this.settings.set('secrets.admin_token', value);
    return { ok: true };
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
