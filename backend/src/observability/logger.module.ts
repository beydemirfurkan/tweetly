import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

const HEADER = 'x-request-id';

/**
 * Wraps nestjs-pino with correlation-aware genReqId so the X-Request-Id
 * seeded by RequestContextMiddleware (faz 1.4) carries through into every
 * log line as `req.id`. Outputs structured JSON in production and the
 * pretty colourised stream in development.
 *
 * Existing `new Logger(Name)` callsites continue to work — Nest's Logger
 * delegates here once main.ts calls `app.useLogger(...)`.
 */
@Module({
  imports: [
    PinoLoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
        autoLogging: process.env.NODE_ENV === 'production',
        genReqId: (req: IncomingMessage, res: ServerResponse) => {
          const incoming = req.headers[HEADER];
          const id = typeof incoming === 'string' && incoming ? incoming : randomUUID();
          res.setHeader(HEADER, id);
          return id;
        },
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : {
                target: 'pino-pretty',
                options: { singleLine: true, ignore: 'req.headers,res.headers,pid,hostname' },
              },
        // Drop noisy fields by default; flip via LOG_HTTP_HEADERS=true if needed.
        serializers: {
          req: (req: IncomingMessage) => ({
            id: (req as IncomingMessage & { id?: string }).id,
            method: req.method,
            url: req.url,
          }),
          res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
        },
      },
    }),
  ],
  exports: [PinoLoggerModule],
})
export class LoggerModule {}
