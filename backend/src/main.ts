import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { Logger as PinoLogger } from 'nestjs-pino';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import type { Request, Response } from 'express';
import { AppModule } from './app.module';
import { loadMasterKeyFromEnv } from './common/crypto/credential-cipher.service';
import { GlobalExceptionFilter } from './common/exceptions';
import { RequestContext } from './common/context';

dotenv.config();

function ensureEncryptionKey(): void {
  // Fail fast at boot — DI would surface this lazily on first cipher use.
  loadMasterKeyFromEnv();
}

function ensureExecutorMode(isProd: boolean): void {
  if (process.env.X_EXECUTOR_MODE) return;

  process.env.X_EXECUTOR_MODE = isProd ? 'patchright' : 'noop';
  Logger.log(`X_EXECUTOR_MODE defaulted to ${process.env.X_EXECUTOR_MODE}`, 'Bootstrap');
}

function buildCorsOptions(isProd: boolean): {
  origin: string[] | boolean;
  credentials: boolean;
  methods: string[];
  allowedHeaders: string[];
  exposedHeaders: string[];
} {
  const raw = (process.env.CORS_ORIGINS ?? '').trim();
  let origin: string[] | boolean;

  if (raw) {
    origin = raw.split(',').map((s) => s.trim()).filter(Boolean);
    Logger.log(`CORS allowlist: ${(origin as string[]).join(', ')}`, 'Bootstrap');
  } else if (isProd) {
    origin = [];
    Logger.warn(
      'CORS_ORIGINS is empty in production — all browser origins will be rejected. ' +
        'Set CORS_ORIGINS=https://panel.example.com,https://app.example.com',
      'Bootstrap',
    );
  } else {
    origin = true;
    Logger.log('CORS open in development (set CORS_ORIGINS to restrict)', 'Bootstrap');
  }

  return {
    origin,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With'],
    exposedHeaders: ['Retry-After'],
  };
}

async function bootstrap(): Promise<void> {
  const isProd = process.env.NODE_ENV === 'production';
  ensureEncryptionKey();
  ensureExecutorMode(isProd);

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // Route every Nest log call (including `new Logger(Name)` constructors that
  // pre-date this faz) through pino. Buffer above ensures bootstrap-time logs
  // emitted before this line are flushed via the structured logger.
  app.useLogger(app.get(PinoLogger));

  app.enableShutdownHooks();
  app.enableCors(buildCorsOptions(isProd));
  app.useGlobalFilters(new GlobalExceptionFilter(app.get(RequestContext)));

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
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  app.use(
    '/docs',
    apiReference({
      content: document,
      metaData: { title: 'Tweetly API Reference' },
      authentication: { preferredSecurityScheme: 'apiKey' },
    }),
  );

  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/api/openapi.json', (_req: Request, res: Response) => {
    res.json(document);
  });

  const port = parseInt(process.env.NEST_PORT ?? '3001', 10);
  await app.listen(port);

  Logger.log(`NestJS app listening on http://localhost:${port}`, 'Bootstrap');
  Logger.log(`OpenAPI:    http://localhost:${port}/api/openapi.json`, 'Bootstrap');
  Logger.log(`API Reference: http://localhost:${port}/docs`, 'Bootstrap');
  Logger.log(`Admin API:  http://localhost:${port}/admin/status`, 'Bootstrap');
  Logger.log(`Metrics:    http://localhost:${port}/metrics`, 'Bootstrap');
  Logger.log(`Health:     http://localhost:${port}/health`, 'Bootstrap');
}

bootstrap().catch((err) => {
  Logger.error(err instanceof Error ? err.stack ?? err.message : String(err), 'Bootstrap');
  process.exit(1);
});
