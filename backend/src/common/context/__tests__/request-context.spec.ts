import { RequestContext, newCorrelationId } from './request-context';

describe('RequestContext', () => {
  it('returns undefined outside any run() scope', () => {
    const ctx = new RequestContext();
    expect(ctx.current()).toBeUndefined();
    expect(ctx.correlationId()).toBeUndefined();
    expect(ctx.userId()).toBeUndefined();
  });

  it('exposes seeded correlationId inside run()', () => {
    const ctx = new RequestContext();
    ctx.run({ correlationId: 'cid-1' }, () => {
      expect(ctx.correlationId()).toBe('cid-1');
    });
  });

  it('mutations propagate to async callbacks within the same scope', async () => {
    const ctx = new RequestContext();
    await new Promise<void>((resolve) => {
      ctx.run({ correlationId: 'c' }, async () => {
        ctx.setUserId('u-99');
        await Promise.resolve();
        expect(ctx.userId()).toBe('u-99');
        resolve();
      });
    });
  });

  it('isolates concurrent runs', async () => {
    const ctx = new RequestContext();
    const a = ctx.run({ correlationId: 'a' }, async () => {
      await new Promise((r) => setImmediate(r));
      return ctx.correlationId();
    });
    const b = ctx.run({ correlationId: 'b' }, async () => {
      await new Promise((r) => setImmediate(r));
      return ctx.correlationId();
    });
    expect(await a).toBe('a');
    expect(await b).toBe('b');
  });
});

describe('newCorrelationId', () => {
  it('preserves a valid seed', () => {
    expect(newCorrelationId('req_abc123')).toBe('req_abc123');
  });

  it('rejects too-short seed and generates fresh', () => {
    const id = newCorrelationId('short');
    expect(id).not.toBe('short');
    expect(id.length).toBeGreaterThan(8);
  });

  it('rejects malicious seed and generates fresh', () => {
    const id = newCorrelationId('bad id with spaces');
    expect(id).not.toBe('bad id with spaces');
  });
});
