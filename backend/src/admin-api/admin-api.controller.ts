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
import { AdminTokenGuard } from './admin-token.guard';
import { AdminApiService } from './admin-api.service';
import { SettingsService } from '../settings/settings.service';
import { UsersService } from '../auth/users.service';

interface SecretUpdateBody {
  adminToken?: string;
}

interface CreateUserBody {
  email?: string;
}

@Controller('admin')
@UseGuards(AdminTokenGuard)
export class AdminApiController {
  constructor(
    private readonly service: AdminApiService,
    private readonly settings: SettingsService,
    private readonly users: UsersService,
  ) {}

  @Get('status')
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
  async getQueueDepth() {
    return this.service.getQueueDepth();
  }

  @Get('secrets')
  async getSecretsStatus() {
    const adminToken = await this.settings.get<string>('secrets.admin_token', '');
    return { adminTokenConfigured: Boolean(adminToken) };
  }

  @Put('secrets')
  @HttpCode(HttpStatus.OK)
  async updateSecrets(@Body() body: SecretUpdateBody) {
    const value = body.adminToken?.trim();
    if (!value) throw new BadRequestException('adminToken is required');
    await this.settings.set('secrets.admin_token', value);
    return { ok: true };
  }

  @Post('users')
  @HttpCode(HttpStatus.CREATED)
  async createUser(@Body() body: CreateUserBody) {
    const email = body.email?.trim();
    if (!email) throw new BadRequestException('email is required');
    const user = await this.users.findOrCreate(email);
    return { id: user.id, email: user.email, status: user.status, createdAt: user.createdAt };
  }
}
