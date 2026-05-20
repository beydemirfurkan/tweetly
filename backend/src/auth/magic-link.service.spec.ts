import { Logger, ServiceUnavailableException } from '@nestjs/common';
import type { UpdateQueryBuilder, UpdateResult } from 'typeorm';
import { MagicLinkService } from './magic-link.service';
import { MagicLinkEntity } from '@persistence/entities/magic-link.entity';
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

  describe('consume()', () => {
    function mockConsumeUpdate(raw: unknown[]) {
      const builder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ raw, affected: raw.length } as UpdateResult),
      } as unknown as jest.Mocked<UpdateQueryBuilder<MagicLinkEntity>>;
      return builder;
    }

    it('returns the user id from a single atomic consume update', async () => {
      const { service, repo } = createService();
      const builder = mockConsumeUpdate([{ user_id: 'user-1' }]);
      repo.createQueryBuilder = jest.fn().mockReturnValue(builder) as any;

      await expect(service.consume('valid-token')).resolves.toBe('user-1');

      expect(repo.findOne).not.toHaveBeenCalled();
      expect(repo.update).not.toHaveBeenCalled();
      expect(builder.update).toHaveBeenCalledWith(MagicLinkEntity);
      expect(builder.set).toHaveBeenCalledWith({ consumedAt: expect.any(Function) });
      expect(builder.where).toHaveBeenCalledWith('token_hash = :tokenHash', {
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      });
      expect(builder.andWhere).toHaveBeenCalledWith('consumed_at IS NULL');
      expect(builder.andWhere).toHaveBeenCalledWith('expires_at > now()');
      expect(builder.returning).toHaveBeenCalledWith(['userId']);
    });

    it('returns null when a racing request already consumed the token', async () => {
      const { service, repo } = createService();
      repo.createQueryBuilder = jest.fn().mockReturnValue(mockConsumeUpdate([])) as any;

      await expect(service.consume('valid-token')).resolves.toBeNull();

      expect(repo.findOne).not.toHaveBeenCalled();
      expect(repo.update).not.toHaveBeenCalled();
    });
  });
});
