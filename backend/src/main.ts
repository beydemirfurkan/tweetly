import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AppModule } from './app.module';

dotenv.config();

function ensureExecutorMode(isProd: boolean): void {
  if (process.env.X_EXECUTOR_MODE) return;

  process.env.X_EXECUTOR_MODE = isProd ? 'patchright' : 'noop';
  Logger.log(`X_EXECUTOR_MODE defaulted to ${process.env.X_EXECUTOR_MODE}`, 'Bootstrap');
}

async function bootstrap(): Promise<void> {
  const isProd = process.env.NODE_ENV === 'production';
  ensureExecutorMode(isProd);

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    logger: isProd ? ['error', 'warn', 'log'] : ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  app.enableShutdownHooks();
  app.enableCors();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Tweetly API')
    .setDescription(
      'Multi-tenant X (Twitter) automation platform. Connect your X accounts and run actions ' +
        '(post, reply, like, retweet, quote, follow, bookmark, search, monitor) from your own ' +
        'AI agents over MCP or REST.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'tk_*',
        description: 'Tweetly API key issued from /auth/api-keys',
      },
      'apiKey',
    )
    .addTag('auth', 'Magic-link login and API key management')
    .addTag('accounts', 'Connected X accounts')
    .addTag('actions', 'Asynchronous X actions (post, reply, like, ...)')
    .addTag('x', 'Direct X read/undo operations (synchronous via Patchright)')
    .addTag('monitors', 'Account monitors with webhook delivery')
    .addTag('admin', 'Bootstrap-only endpoints (system token required)')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/api/openapi.json', (_req: Request, res: Response) => {
    res.json(document);
  });

  const port = parseInt(process.env.NEST_PORT ?? '3001', 10);
  await app.listen(port);

  Logger.log(`NestJS app listening on http://localhost:${port}`, 'Bootstrap');
  Logger.log(`OpenAPI:    http://localhost:${port}/api/openapi.json`, 'Bootstrap');
  Logger.log(`Swagger UI: http://localhost:${port}/docs`, 'Bootstrap');
  Logger.log(`Admin API:  http://localhost:${port}/admin/status`, 'Bootstrap');
  Logger.log(`Metrics:    http://localhost:${port}/metrics`, 'Bootstrap');
  Logger.log(`Health:     http://localhost:${port}/health`, 'Bootstrap');
}

bootstrap().catch((err) => {
  Logger.error(err instanceof Error ? err.stack ?? err.message : String(err), 'Bootstrap');
  process.exit(1);
});
