import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { MagicLinkService } from './magic-link.service';
import type { MagicLinkEntity } from '@persistence/entities/magic-link.entity';
import { mockRepository } from '@/test/mocks/repository.mock';

function createService() {
  const repo = mockRepository<MagicLinkEntity>();
  repo.insert = jest.fn().mockResolvedValue({ identifiers: [{ id: 'ml-1' }] }) as any;
  const settings = {
    get: jest.fn().mockImplementation(async (_key: string, fallback: unknown) => fallback),
  };
  const service = new MagicLinkService(repo as any, settings as any);
  return { service, repo, settings };
}

/**
 * Builds a fake QueryBuilder that mirrors the real chain used in
 * MagicLinkService.consume. `executeImpl` lets a test return a different
 * { raw } payload on each call to simulate concurrent winners/losers.
 */
function stubQueryBuilder(repo: jest.Mocked<any>, executeImpl: jest.Mock) {
  const qb: any = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    returning: jest.fn().mockReturnThis(),
    execute: executeImpl,
  };
  repo.createQueryBuilder = jest.fn().mockReturnValue(qb);
  return qb;
}

describe('MagicLinkService', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    jest.restoreAllMocks();
  });

  it('logs the magic-link URL to console in development fallback mode', async () => {
    process.env.NODE_ENV = 'development';
    const { service } = createService();

    const result = await service.issue('user-1', 'user@example.com');

    expect(result.token).toMatch(/^[a-f0-9]{64}$/);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[MAGIC_LINK] user@example.com'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(result.token));
  });

  it('does not log the magic-link URL in production when delivery is not configured', async () => {
    process.env.NODE_ENV = 'production';
    const { service } = createService();

    await expect(service.issue('user-1', 'user@example.com')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    const logged = logSpy.mock.calls.flat().join('\n');
    const warned = warnSpy.mock.calls.flat().join('\n');
    expect(logged).not.toContain('[MAGIC_LINK]');
    expect(logged).not.toContain('/auth/verify?token=');
    expect(warned).toContain('Magic-link console fallback disabled');
  });

  describe('consume()', () => {
    it('returns null for an empty token without touching the repo', async () => {
      const { service, repo } = createService();
      const created = stubQueryBuilder(
        repo as unknown as jest.Mocked<any>,
        jest.fn().mockResolvedValue({ raw: [] }),
      );
      await expect(service.consume('')).resolves.toBeNull();
      expect(created.execute).not.toHaveBeenCalled();
    });

    it('returns the user_id when the atomic CAS hits exactly one row', async () => {
      const { service, repo } = createService();
      stubQueryBuilder(
        repo as unknown as jest.Mocked<any>,
        jest.fn().mockResolvedValue({ raw: [{ user_id: 'user-1' }] }),
      );
      await expect(service.consume('token-abc')).resolves.toBe('user-1');
    });

    it('two parallel consume() calls with the same token: exactly one returns userId, the other null', async () => {
      const { service, repo } = createService();
      // First execute returns a winner row (the row was unconsumed); second
      // execute simulates the DB-side CAS missing because `consumed_at IS NULL`
      // no longer matches.
      const execute = jest
        .fn()
        .mockResolvedValueOnce({ raw: [{ user_id: 'user-1' }] })
        .mockResolvedValueOnce({ raw: [] });
      stubQueryBuilder(repo as unknown as jest.Mocked<any>, execute);

      const [a, b] = await Promise.all([
        service.consume('same-token'),
        service.consume('same-token'),
      ]);

      const results = [a, b].sort((x, y) => (x ?? '').localeCompare(y ?? ''));
      expect(results).toEqual([null, 'user-1']);
      expect(execute).toHaveBeenCalledTimes(2);
    });

    it('returns null when the CAS misses (expired, already consumed, or unknown token)', async () => {
      const { service, repo } = createService();
      stubQueryBuilder(
        repo as unknown as jest.Mocked<any>,
        jest.fn().mockResolvedValue({ raw: [] }),
      );
      await expect(service.consume('expired-or-used')).resolves.toBeNull();
    });
  });

  it('does not log the magic-link URL in production when SMTP delivery fails', async () => {
    process.env.NODE_ENV = 'production';
    const { service } = createService();
    const sendMail = jest.fn().mockRejectedValue(new Error('smtp down'));
    Object.assign(service as any, {
      transporter: { sendMail },
      cachedConfig: {
        host: 'smtp.example.com',
        port: 587,
        user: null,
        pass: null,
        secure: false,
        from: 'tweetly <noreply@example.com>',
      },
    });

    await expect(service.issue('user-1', 'user@example.com')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    const logged = logSpy.mock.calls.flat().join('\n');
    expect(sendMail).toHaveBeenCalled();
    expect(logged).not.toContain('[MAGIC_LINK]');
    expect(logged).not.toContain('/auth/verify?token=');
  });
});
