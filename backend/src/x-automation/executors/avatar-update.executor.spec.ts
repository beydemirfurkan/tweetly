import { AvatarUpdateExecutor } from './avatar-update.executor';
import { authError, fakeAction, fakeRegistry, fakeSession, mockXDirect } from './__tests__/test-helpers';

describe('AvatarUpdateExecutor', () => {
  it('delegates to xDirect.updateAvatar on success', async () => {
    const xDirect = mockXDirect();
    const exec = new AvatarUpdateExecutor(fakeRegistry(), xDirect);

    const result = await exec.execute(
      fakeAction({ file_path: '/tmp/a.jpg' }, 'avatar_update'),
      fakeSession(),
    );

    expect(result).toEqual({ ok: true, result: { kind: 'engagement', at: expect.any(String) } });
    expect(xDirect.updateAvatar).toHaveBeenCalledWith('/tmp/a.jpg', 'acc-1');
  });

  it('returns permanent error for empty file_path', async () => {
    const xDirect = mockXDirect();
    const exec = new AvatarUpdateExecutor(fakeRegistry(), xDirect);

    const result = await exec.execute(fakeAction({ file_path: '' }, 'avatar_update'), fakeSession());

    expect(result).toEqual({ ok: false, errorClass: 'permanent', message: expect.stringContaining('file_path') });
    expect(xDirect.updateAvatar).not.toHaveBeenCalled();
  });

  it('classifies "file not found" as permanent (no retry on missing files)', async () => {
    const xDirect = mockXDirect({
      updateAvatar: jest.fn().mockRejectedValue(new Error('avatar file not found: /tmp/missing.jpg')),
    });
    const exec = new AvatarUpdateExecutor(fakeRegistry(), xDirect);

    const result = await exec.execute(
      fakeAction({ file_path: '/tmp/missing.jpg' }, 'avatar_update'),
      fakeSession(),
    );

    expect(result).toEqual({ ok: false, errorClass: 'permanent', message: expect.stringContaining('file not found') });
  });

  it('returns errorClass=auth on AuthRequiredError', async () => {
    const xDirect = mockXDirect({ updateAvatar: jest.fn().mockRejectedValue(authError()) });
    const exec = new AvatarUpdateExecutor(fakeRegistry(), xDirect);

    const result = await exec.execute(
      fakeAction({ file_path: '/tmp/a.jpg' }, 'avatar_update'),
      fakeSession(),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorClass).toBe('auth');
  });

  it('returns errorClass=transient on other errors', async () => {
    const xDirect = mockXDirect({
      updateAvatar: jest.fn().mockRejectedValue(new Error('upload timeout')),
    });
    const exec = new AvatarUpdateExecutor(fakeRegistry(), xDirect);

    const result = await exec.execute(
      fakeAction({ file_path: '/tmp/a.jpg' }, 'avatar_update'),
      fakeSession(),
    );

    expect(result).toEqual({ ok: false, errorClass: 'transient', message: 'upload timeout' });
  });

  it('registers itself on bootstrap', () => {
    const registry = fakeRegistry();
    const exec = new AvatarUpdateExecutor(registry, mockXDirect());
    exec.onApplicationBootstrap();
    expect(registry.register).toHaveBeenCalledWith(exec);
  });
});
