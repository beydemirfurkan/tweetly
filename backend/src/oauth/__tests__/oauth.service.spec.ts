jest.mock('crypto', () => {
  const actual = jest.requireActual<typeof import('crypto')>('crypto');
  return { ...actual, timingSafeEqual: jest.fn(actual.timingSafeEqual) };
});

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import * as crypto from 'crypto';
import { OAuthService } from '../oauth.service';
import { OAuthCodeStore } from '../oauth-code-store.service';
import { OAuthCredentialHasher } from '../credential-hasher.service';
import { PkceVerifier } from '../pkce-verifier.service';
import type { OAuthClientEntity } from '@persistence/entities/oauth-client.entity';

function makeStore(): OAuthCodeStore {
  delete process.env.REDIS_URL;
  const store = new OAuthCodeStore();
  store.onModuleInit();
  return store;
}

function makeRepo() {
  const rows = new Map<string, OAuthClientEntity>();
  return {
    rows,
    create: jest.fn((init: Partial<OAuthClientEntity>) => ({ ...init }) as OAuthClientEntity),
    save: jest.fn(async (entity: OAuthClientEntity) => {
      const saved = { ...entity, id: 'uuid-' + entity.clientId, createdAt: new Date() };
      rows.set(saved.clientId, saved);
      return saved;
    }),
    findOne: jest.fn(async (opts: { where: { clientId: string } }) => {
      return rows.get(opts.where.clientId) ?? null;
    }),
  };
}

function makeService() {
  const repo = makeRepo();
  const store = makeStore();
  // Use the real hasher + PKCE verifier: they're pure crypto primitives and
  // the existing assertions inspect concrete SHA-256 output, so a stub
  // would just re-implement them.
  const svc = new OAuthService(repo as never, store, new OAuthCredentialHasher(), new PkceVerifier());
  return { svc, repo, store };
}

afterEach(() => {
  jest.clearAllMocks();
});

describe('OAuthService.registerClient', () => {
  it('issues client_id + plaintext secret + persists hash', async () => {
    const { svc, repo } = makeService();
    const result = await svc.registerClient({
      clientName: 'Claude Desktop',
      redirectUris: ['http://localhost:1234/cb'],
    });
    expect(result.clientId).toMatch(/^oauth_[0-9a-f]{32}$/);
    expect(result.clientSecret).toMatch(/^[0-9a-f]{64}$/);
    expect(result.redirectUris).toEqual(['http://localhost:1234/cb']);

    const saved = repo.rows.get(result.clientId)!;
    // Stored hash must be SHA256 of plaintext, not plaintext itself
    const expectedHash = createHash('sha256').update(result.clientSecret).digest('hex');
    expect(saved.clientSecretHash).toBe(expectedHash);
    expect(saved.clientSecretHash).not.toBe(result.clientSecret);
  });

  it('rejects empty redirect_uris', async () => {
    const { svc } = makeService();
    await expect(
      svc.registerClient({ clientName: 'x', redirectUris: [] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects malformed redirect_uri', async () => {
    const { svc } = makeService();
    await expect(
      svc.registerClient({ clientName: 'x', redirectUris: ['not a uri'] }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('OAuthService.verifyClientSecret', () => {
  it('returns the client when secret matches', async () => {
    const timingSafeEqual = crypto.timingSafeEqual as jest.MockedFunction<typeof crypto.timingSafeEqual>;
    const { svc } = makeService();
    const reg = await svc.registerClient({
      clientName: 'app',
      redirectUris: ['http://localhost/cb'],
    });
    const expectedHash = createHash('sha256').update(reg.clientSecret).digest('hex');

    const verified = await svc.verifyClientSecret(reg.clientId, reg.clientSecret);

    expect(verified?.clientId).toBe(reg.clientId);
    expect(timingSafeEqual).toHaveBeenCalledWith(
      Buffer.from(expectedHash),
      Buffer.from(expectedHash),
    );
  });

  it('returns null on wrong secret', async () => {
    const { svc } = makeService();
    const reg = await svc.registerClient({
      clientName: 'app',
      redirectUris: ['http://localhost/cb'],
    });
    expect(await svc.verifyClientSecret(reg.clientId, 'wrong')).toBeNull();
  });

  it('returns null for unknown client', async () => {
    const { svc } = makeService();
    expect(await svc.verifyClientSecret('oauth_nope', 'whatever')).toBeNull();
  });

  it('guards hash length mismatches before calling timingSafeEqual', async () => {
    const timingSafeEqual = crypto.timingSafeEqual as jest.MockedFunction<typeof crypto.timingSafeEqual>;
    const { svc, repo } = makeService();
    const reg = await svc.registerClient({
      clientName: 'app',
      redirectUris: ['http://localhost/cb'],
    });
    repo.rows.get(reg.clientId)!.clientSecretHash = 'short';

    expect(await svc.verifyClientSecret(reg.clientId, reg.clientSecret)).toBeNull();
    expect(timingSafeEqual).not.toHaveBeenCalled();
  });
});

describe('OAuthService.assertRedirectUriRegistered', () => {
  it('passes when uri is in the registered list', () => {
    const { svc } = makeService();
    const client = { redirectUris: ['http://a/cb', 'http://b/cb'] } as OAuthClientEntity;
    expect(() => svc.assertRedirectUriRegistered(client, 'http://b/cb')).not.toThrow();
  });

  it('throws when uri is not registered', () => {
    const { svc } = makeService();
    const client = { redirectUris: ['http://a/cb'] } as OAuthClientEntity;
    expect(() => svc.assertRedirectUriRegistered(client, 'http://evil/cb')).toThrow(
      BadRequestException,
    );
  });
});

describe('OAuthService.requireClient', () => {
  it('throws NotFound when missing', async () => {
    const { svc } = makeService();
    await expect(svc.requireClient('oauth_nope')).rejects.toThrow(NotFoundException);
  });
});

describe('OAuthService PKCE (S256)', () => {
  it('verifies a correct verifier+challenge pair', () => {
    const { svc } = makeService();
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    expect(svc.verifyPkce(verifier, challenge)).toBe(true);
  });

  it('rejects mismatched verifier', () => {
    const { svc } = makeService();
    const verifier = randomBytes(32).toString('base64url');
    const otherVerifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(otherVerifier).digest('base64url');
    expect(svc.verifyPkce(verifier, challenge)).toBe(false);
  });

  it('rejects empty inputs', () => {
    const { svc } = makeService();
    expect(svc.verifyPkce('', 'challenge')).toBe(false);
    expect(svc.verifyPkce('verifier', '')).toBe(false);
  });
});

describe('OAuthService auth-code lifecycle', () => {
  it('issues then consumes (single-use)', async () => {
    const { svc } = makeService();
    const code = await svc.issueAuthCode({
      userId: 'u-1',
      clientId: 'oauth_x',
      redirectUri: 'http://localhost/cb',
      codeChallenge: 'c',
      scope: '*',
    });
    expect(code).toMatch(/^[0-9a-f]{64}$/);

    const consumed = await svc.consumeAuthCode(code);
    expect(consumed?.userId).toBe('u-1');

    // Second consume: gone
    expect(await svc.consumeAuthCode(code)).toBeNull();
  });
});
