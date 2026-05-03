import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { RequestContext, newCorrelationId } from './request-context';

const HEADER = 'x-request-id';

/**
 * First middleware on every request: opens an AsyncLocalStorage scope so any
 * downstream code can call `RequestContext.correlationId()` without threading
 * the value through call sites. Echoes the id back on the response so
 * clients (and proxies) can correlate logs.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly ctx: RequestContext) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header(HEADER);
    const correlationId = newCorrelationId(incoming);
    res.setHeader(HEADER, correlationId);
    this.ctx.run({ correlationId }, () => next());
  }
}
