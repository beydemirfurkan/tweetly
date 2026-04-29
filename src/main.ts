import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { existsSync } from 'fs';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const isProd = process.env.NODE_ENV === 'production';
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    logger: isProd ? ['error', 'warn', 'log'] : ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  app.enableShutdownHooks();
  app.enableCors({ origin: false });

  const panelDir = join(__dirname, '..', 'panel-static');
  if (existsSync(panelDir)) {
    app.useStaticAssets(panelDir, { prefix: '/panel/', extensions: ['html'] });
    Logger.log(`Panel:      http://localhost:${parseInt(process.env.NEST_PORT ?? '3001', 10)}/panel`, 'Bootstrap');
  }

  const port = parseInt(process.env.NEST_PORT ?? '3001', 10);
  await app.listen(port);

  Logger.log(`NestJS app listening on http://localhost:${port}`, 'Bootstrap');
  Logger.log(`Admin API:  http://localhost:${port}/admin/status`, 'Bootstrap');
  Logger.log(`Metrics:    http://localhost:${port}/metrics`, 'Bootstrap');
  Logger.log(`Health:     http://localhost:${port}/health`, 'Bootstrap');
}

bootstrap().catch((err) => {
  Logger.error(err instanceof Error ? err.stack ?? err.message : String(err), 'Bootstrap');
  process.exit(1);
});
