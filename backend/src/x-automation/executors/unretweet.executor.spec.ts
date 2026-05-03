import { UnretweetExecutor } from './unretweet.executor';
import { authError, fakeAction, fakeRegistry, fakeSession, mockXDirect } from './__tests__/test-helpers';

describe('UnretweetExecutor', () => {
  const url = 'https://x.com/u/status/1';

  it('delegates to xDirect.unretweetTweet on success', async () => {
    const xDirect = mockXDirect();
    const exec = new UnretweetExecutor(fakeRegistry(), xDirect);

    const result = await exec.execute(fakeAction({ target_tweet_url: url }, 'unretweet'), fakeSession());

    expect(result).toEqual({ ok: true, result: { kind: 'engagement', at: expect.any(String) } });
    expect(xDirect.unretweetTweet).toHaveBeenCalledWith(url, 'acc-1');
  });

  it('returns errorClass=auth on AuthRequiredError', async () => {
    const xDirect = mockXDirect({ unretweetTweet: jest.fn().mockRejectedValue(authError()) });
    const exec = new UnretweetExecutor(fakeRegistry(), xDirect);

    const result = await exec.execute(fakeAction({ target_tweet_url: url }, 'unretweet'), fakeSession());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorClass).toBe('auth');
  });

  it('returns errorClass=transient on generic errors', async () => {
    const xDirect = mockXDirect({ unretweetTweet: jest.fn().mockRejectedValue(new Error('boom')) });
    const exec = new UnretweetExecutor(fakeRegistry(), xDirect);

    const result = await exec.execute(fakeAction({ target_tweet_url: url }, 'unretweet'), fakeSession());

    expect(result).toEqual({ ok: false, errorClass: 'transient', message: 'boom' });
  });

  it('registers itself on bootstrap', () => {
    const registry = fakeRegistry();
    const exec = new UnretweetExecutor(registry, mockXDirect());
    exec.onApplicationBootstrap();
    expect(registry.register).toHaveBeenCalledWith(exec);
  });
});
