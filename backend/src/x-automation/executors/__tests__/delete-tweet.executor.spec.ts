import { DeleteTweetExecutor } from '../delete-tweet.executor';
import { authError, fakeAction, fakeRegistry, fakeSession, mockXDirectWrite } from '../__tests__/test-helpers';

describe('DeleteTweetExecutor', () => {
  const url = 'https://x.com/u/status/1';

  it('delegates to xDirect.deleteTweet on success', async () => {
    const xDirect = mockXDirectWrite();
    const exec = new DeleteTweetExecutor(fakeRegistry(), xDirect);

    const result = await exec.execute(fakeAction({ target_tweet_url: url }, 'delete_tweet'), fakeSession());

    expect(result).toEqual({ ok: true, result: { kind: 'engagement', at: expect.any(String) } });
    expect(xDirect.deleteTweet).toHaveBeenCalledWith(url, 'acc-1');
  });

  it('returns errorClass=auth on AuthRequiredError', async () => {
    const xDirect = mockXDirectWrite({ deleteTweet: jest.fn().mockRejectedValue(authError()) });
    const exec = new DeleteTweetExecutor(fakeRegistry(), xDirect);

    const result = await exec.execute(fakeAction({ target_tweet_url: url }, 'delete_tweet'), fakeSession());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorClass).toBe('auth');
  });

  it('returns errorClass=transient on generic errors', async () => {
    const xDirect = mockXDirectWrite({ deleteTweet: jest.fn().mockRejectedValue(new Error('not found')) });
    const exec = new DeleteTweetExecutor(fakeRegistry(), xDirect);

    const result = await exec.execute(fakeAction({ target_tweet_url: url }, 'delete_tweet'), fakeSession());

    expect(result).toEqual({ ok: false, errorClass: 'transient', message: 'not found' });
  });

  it('registers itself on bootstrap', () => {
    const registry = fakeRegistry();
    const exec = new DeleteTweetExecutor(registry, mockXDirectWrite());
    exec.onApplicationBootstrap();
    expect(registry.register).toHaveBeenCalledWith(exec);
  });
});
