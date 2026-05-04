import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { DataSource } from 'typeorm';

type CheckStatus = 'ok' | 'error' | 'skipped';

interface ReadinessResponse {
  status: 'ok' | 'error';
  ts: string;
  checks: {
    database: { status: CheckStatus; message?: string };
    migrations: { status: CheckStatus; pending?: boolean; message?: string };
    redis: { status: CheckStatus; configured: boolean };
    workers: {
      claimWorker: 'enabled' | 'disabled';
      loginWorker: 'enabled' | 'disabled';
      monitorPolling: 'enabled' | 'disabled';
      extractionWorker: 'enabled' | 'disabled';
    };
  };
}

@ApiExcludeController()
@Controller()
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get('health')
  health(): { status: 'ok'; ts: string; build: 'nest' } {
    return { status: 'ok', ts: new Date().toISOString(), build: 'nest' };
  }

  @Get('ready')
  async ready(): Promise<ReadinessResponse> {
    const response: ReadinessResponse = {
      status: 'ok',
      ts: new Date().toISOString(),
      checks: {
        database: { status: 'ok' },
        migrations: { status: 'ok', pending: false },
        redis: { status: process.env.REDIS_URL ? 'ok' : 'skipped', configured: Boolean(process.env.REDIS_URL) },
        workers: {
          claimWorker: process.env.WORKER_DISABLED === 'true' ? 'disabled' : 'enabled',
          loginWorker: process.env.LOGIN_WORKER_DISABLED === 'true' ? 'disabled' : 'enabled',
          monitorPolling: process.env.MONITOR_POLLING_ENABLED === 'false' ? 'disabled' : 'enabled',
          extractionWorker: process.env.EXTRACTION_WORKER_DISABLED === 'true' ? 'disabled' : 'enabled',
        },
      },
    };

    try {
      await this.dataSource.query('SELECT 1');
    } catch (err) {
      response.status = 'error';
      response.checks.database = { status: 'error', message: errorMessage(err) };
    }

    try {
      const pending = await this.dataSource.showMigrations();
      response.checks.migrations = { status: pending ? 'error' : 'ok', pending };
      if (pending) response.status = 'error';
    } catch (err) {
      response.status = 'error';
      response.checks.migrations = { status: 'error', message: errorMessage(err) };
    }

    if (response.status !== 'ok') {
      throw new ServiceUnavailableException(response);
    }

    return response;
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
