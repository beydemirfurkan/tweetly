import { BannerUpdateExecutor } from '../banner-update.executor';
import { authError, fakeAction, fakeRegistry, fakeSession, mockXDirectProfile } from '../__tests__/test-helpers';

describe('BannerUpdateExecutor', () => {
  it('delegates to xDirect.updateBanner on success', async () => {
    const xDirect = mockXDirectProfile();
    const exec = new BannerUpdateExecutor(fakeRegistry(), xDirect);

    const result = await exec.execute(
      fakeAction({ file_path: '/tmp/b.jpg' }, 'banner_update'),
      fakeSession(),
    );

    expect(result).toEqual({ ok: true, result: { kind: 'engagement', at: expect.any(String) } });
    expect(xDirect.updateBanner).toHaveBeenCalledWith('/tmp/b.jpg', 'acc-1');
  });

  it('returns permanent error for empty file_path', async () => {
    const xDirect = mockXDirectProfile();
    const exec = new BannerUpdateExecutor(fakeRegistry(), xDirect);

    const result = await exec.execute(fakeAction({ file_path: '' }, 'banner_update'), fakeSession());

    expect(result).toEqual({ ok: false, errorClass: 'permanent', message: expect.stringContaining('file_path') });
    expect(xDirect.updateBanner).not.toHaveBeenCalled();
  });

  it('classifies "file not found" as permanent', async () => {
    const xDirect = mockXDirectProfile({
      updateBanner: jest.fn().mockRejectedValue(new Error('banner file not found: /tmp/missing.jpg')),
    });
    const exec = new BannerUpdateExecutor(fakeRegistry(), xDirect);

    const result = await exec.execute(
      fakeAction({ file_path: '/tmp/missing.jpg' }, 'banner_update'),
      fakeSession(),
    );

    expect(result).toEqual({ ok: false, errorClass: 'permanent', message: expect.stringContaining('file not found') });
  });

  it('returns errorClass=auth on AuthRequiredError', async () => {
    const xDirect = mockXDirectProfile({ updateBanner: jest.fn().mockRejectedValue(authError()) });
    const exec = new BannerUpdateExecutor(fakeRegistry(), xDirect);

    const result = await exec.execute(
      fakeAction({ file_path: '/tmp/b.jpg' }, 'banner_update'),
      fakeSession(),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorClass).toBe('auth');
  });

  it('returns errorClass=transient on other errors', async () => {
    const xDirect = mockXDirectProfile({
      updateBanner: jest.fn().mockRejectedValue(new Error('upload timeout')),
    });
    const exec = new BannerUpdateExecutor(fakeRegistry(), xDirect);

    const result = await exec.execute(
      fakeAction({ file_path: '/tmp/b.jpg' }, 'banner_update'),
      fakeSession(),
    );

    expect(result).toEqual({ ok: false, errorClass: 'transient', message: 'upload timeout' });
  });

  it('registers itself on bootstrap', () => {
    const registry = fakeRegistry();
    const exec = new BannerUpdateExecutor(registry, mockXDirectProfile());
    exec.onApplicationBootstrap();
    expect(registry.register).toHaveBeenCalledWith(exec);
  });
});
