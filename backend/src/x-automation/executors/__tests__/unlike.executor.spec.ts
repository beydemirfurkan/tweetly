import { UnlikeExecutor } from './unlike.executor';
import { authError, fakeAction, fakeRegistry, fakeSession, mockXDirectWrite } from './__tests__/test-helpers';

describe('UnlikeExecutor', () => {
  const url = 'https://x.com/u/status/1';

  it('delegates to xDirect.unlikeTweet and returns engagement result on success', async () => {
    const xDirect = mockXDirectWrite();
    const exec = new UnlikeExecutor(fakeRegistry(), xDirect);

    const result = await exec.execute(fakeAction({ target_tweet_url: url }, 'unlike'), fakeSession());

    expect(result).toEqual({ ok: true, result: { kind: 'engagement', at: expect.any(String) } });
    expect(xDirect.unlikeTweet).toHaveBeenCalledWith(url, 'acc-1');
  });

  it('classifies AuthRequiredError as auth so the session-failure tracker fires', async () => {
    const xDirect = mockXDirectWrite({ unlikeTweet: jest.fn().mockRejectedValue(authError()) });
    const exec = new UnlikeExecutor(fakeRegistry(), xDirect);

    const result = await exec.execute(fakeAction({ target_tweet_url: url }, 'unlike'), fakeSession());

    expect(result).toEqual({ ok: false, errorClass: 'auth', message: expect.stringContaining('AUTH_REQUIRED') });
  });

  it('classifies generic errors as transient (eligible for retry)', async () => {
    const xDirect = mockXDirectWrite({ unlikeTweet: jest.fn().mockRejectedValue(new Error('navigation timeout')) });
    const exec = new UnlikeExecutor(fakeRegistry(), xDirect);

    const result = await exec.execute(fakeAction({ target_tweet_url: url }, 'unlike'), fakeSession());

    expect(result).toEqual({ ok: false, errorClass: 'transient', message: 'navigation timeout' });
  });

  it('registers itself with the executor registry on bootstrap', () => {
    const registry = fakeRegistry();
    const exec = new UnlikeExecutor(registry, mockXDirectWrite());

    exec.onApplicationBootstrap();

    expect(registry.register).toHaveBeenCalledWith(exec);
  });
});
