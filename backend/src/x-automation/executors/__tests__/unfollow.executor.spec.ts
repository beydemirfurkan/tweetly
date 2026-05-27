import { UnfollowExecutor } from './unfollow.executor';
import { authError, fakeAction, fakeRegistry, fakeSession, mockXDirectWrite } from './__tests__/test-helpers';

describe('UnfollowExecutor', () => {
  it('delegates to xDirect.unfollowAccount on success', async () => {
    const xDirect = mockXDirectWrite();
    const exec = new UnfollowExecutor(fakeRegistry(), xDirect);

    const result = await exec.execute(fakeAction({ target_handle: 'elonmusk' }, 'unfollow'), fakeSession());

    expect(result).toEqual({ ok: true, result: { kind: 'engagement', at: expect.any(String) } });
    expect(xDirect.unfollowAccount).toHaveBeenCalledWith('elonmusk', 'acc-1');
  });

  it('returns permanent error for empty target_handle (no point retrying)', async () => {
    const xDirect = mockXDirectWrite();
    const exec = new UnfollowExecutor(fakeRegistry(), xDirect);

    const result = await exec.execute(fakeAction({ target_handle: '   ' }, 'unfollow'), fakeSession());

    expect(result).toEqual({ ok: false, errorClass: 'permanent', message: expect.stringContaining('target_handle') });
    expect(xDirect.unfollowAccount).not.toHaveBeenCalled();
  });

  it('returns errorClass=auth on AuthRequiredError', async () => {
    const xDirect = mockXDirectWrite({ unfollowAccount: jest.fn().mockRejectedValue(authError()) });
    const exec = new UnfollowExecutor(fakeRegistry(), xDirect);

    const result = await exec.execute(fakeAction({ target_handle: 'elonmusk' }, 'unfollow'), fakeSession());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorClass).toBe('auth');
  });

  it('returns errorClass=transient on generic errors', async () => {
    const xDirect = mockXDirectWrite({ unfollowAccount: jest.fn().mockRejectedValue(new Error('boom')) });
    const exec = new UnfollowExecutor(fakeRegistry(), xDirect);

    const result = await exec.execute(fakeAction({ target_handle: 'elonmusk' }, 'unfollow'), fakeSession());

    expect(result).toEqual({ ok: false, errorClass: 'transient', message: 'boom' });
  });

  it('registers itself on bootstrap', () => {
    const registry = fakeRegistry();
    const exec = new UnfollowExecutor(registry, mockXDirectWrite());
    exec.onApplicationBootstrap();
    expect(registry.register).toHaveBeenCalledWith(exec);
  });
});
