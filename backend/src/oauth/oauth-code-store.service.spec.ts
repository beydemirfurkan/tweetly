import { OAuthCodeStore } from './oauth-code-store.service';

function makeStore(): OAuthCodeStore {
  // Forces in-memory backend (REDIS_URL unset).
  delete process.env.REDIS_URL;
  const store = new OAuthCodeStore();
  store.onModuleInit();
  return store;
}

const sample = {
  userId: 'u-1',
  clientId: 'oauth_abc',
  redirectUri: 'http://localhost/cb',
  codeChallenge: 'challenge-xyz',
  scope: '*',
};

describe('OAuthCodeStore (in-memory)', () => {
  it('round-trips a code', async () => {
    const store = makeStore();
    await store.put('code1', sample);
    const got = await store.consume('code1');
    expect(got).toEqual(sample);
  });

  it('consumes once — second consume returns null', async () => {
    const store = makeStore();
    await store.put('code1', sample);
    await store.consume('code1');
    expect(await store.consume('code1')).toBeNull();
  });

  it('returns null for unknown code', async () => {
    const store = makeStore();
    expect(await store.consume('does-not-exist')).toBeNull();
  });
});
