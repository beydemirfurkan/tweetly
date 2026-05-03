import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

@ApiExcludeController()
@Controller()
export class HealthController {
  @Get('health')
  health(): { status: 'ok'; ts: string; build: 'nest' } {
    return { status: 'ok', ts: new Date().toISOString(), build: 'nest' };
  }
}
