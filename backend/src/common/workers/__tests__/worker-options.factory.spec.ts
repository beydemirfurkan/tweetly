import { WorkerOptionsFactory } from '../worker-options.factory';

describe('WorkerOptionsFactory', () => {
  let f: WorkerOptionsFactory;

  beforeEach(() => {
    f = new WorkerOptionsFactory();
  });

  afterEach(() => {
    delete process.env.FOO_POLL_MS;
    delete process.env.FOO_LOCK_TTL_SEC;
    delete process.env.FOO_DISABLED;
    delete process.env.BAR;
  });

  it('uses defaults when env unset', () => {
    expect(f.fromEnv('FOO', { pollMs: 1234, lockTtlSec: 60 })).toEqual({
      pollIntervalMs: 1234,
      lockTtlSec: 60,
      enabled: true,
    });
  });

  it('reads env overrides for poll and lock TTL', () => {
    process.env.FOO_POLL_MS = '500';
    process.env.FOO_LOCK_TTL_SEC = '15';
    expect(f.fromEnv('FOO', { pollMs: 1234, lockTtlSec: 60 })).toEqual({
      pollIntervalMs: 500,
      lockTtlSec: 15,
      enabled: true,
    });
  });

  it('flips enabled to false when FOO_DISABLED=true', () => {
    process.env.FOO_DISABLED = 'true';
    const opts = f.fromEnv('FOO', { pollMs: 1234, lockTtlSec: 60 });
    expect(opts.enabled).toBe(false);
  });

  it('intFromEnv falls back to the provided default', () => {
    expect(f.intFromEnv('BAR', 7)).toBe(7);
    process.env.BAR = '42';
    expect(f.intFromEnv('BAR', 7)).toBe(42);
  });
});
