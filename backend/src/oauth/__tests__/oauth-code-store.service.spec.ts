import { OAuthCodeStore } from '../oauth-code-store.service';

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

  describe('expiry + sweep', () => {
    afterEach(() => {
      delete process.env.OAUTH_CODE_STORE_IN_MEMORY_CAP;
      jest.useRealTimers();
    });

    it('drops expired entries on the next put() call (no unbounded memory growth)', async () => {
      jest.useFakeTimers();
      const store = makeStore();
      await store.put('old-1', sample);
      await store.put('old-2', sample);
      expect(store.sizeInMemory()).toBe(2);

      // Advance past the 60s TTL.
      jest.advanceTimersByTime(61_000);

      // Next put triggers the sweep.
      await store.put('new', sample);
      expect(store.sizeInMemory()).toBe(1);

      // sweepInMemory after that is a no-op (only fresh entry remains).
      expect(store.sweepInMemory()).toBe(0);
    });

    it('sweepInMemory explicitly drops expired entries and returns the count', async () => {
      jest.useFakeTimers();
      const store = makeStore();
      await store.put('a', sample);
      await store.put('b', sample);

      jest.advanceTimersByTime(61_000);
      expect(store.sweepInMemory()).toBe(2);
      expect(store.sizeInMemory()).toBe(0);
    });

    it('rejects put() once the cap is reached so a runaway producer cannot leak heap', async () => {
      process.env.OAUTH_CODE_STORE_IN_MEMORY_CAP = '3';
      const store = makeStore();
      await store.put('c1', sample);
      await store.put('c2', sample);
      await store.put('c3', sample);

      // Cap hit (3 entries, none expired).
      await expect(store.put('c4', sample)).rejects.toThrow(/store full/);
      expect(store.sizeInMemory()).toBe(3);
    });
  });
});
