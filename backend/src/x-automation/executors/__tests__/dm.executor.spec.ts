import { DmExecutor } from '../dm.executor';
import { authError, fakeAction, fakeRegistry, fakeSession, mockXDirectWrite } from '../__tests__/test-helpers';

describe('DmExecutor', () => {
  it('delegates to xDirect.sendDm on success', async () => {
    const xDirect = mockXDirectWrite();
    const exec = new DmExecutor(fakeRegistry(), xDirect);

    const result = await exec.execute(
      fakeAction({ target_handle: 'elonmusk', message: 'hi there' }, 'dm'),
      fakeSession(),
    );

    expect(result).toEqual({ ok: true, result: { kind: 'engagement', at: expect.any(String) } });
    expect(xDirect.sendDm).toHaveBeenCalledWith('elonmusk', 'hi there', 'acc-1');
  });

  it('returns permanent error for missing target_handle (no point retrying)', async () => {
    const xDirect = mockXDirectWrite();
    const exec = new DmExecutor(fakeRegistry(), xDirect);

    const result = await exec.execute(fakeAction({ target_handle: '', message: 'x' }, 'dm'), fakeSession());

    expect(result).toEqual({ ok: false, errorClass: 'permanent', message: expect.stringContaining('required') });
    expect(xDirect.sendDm).not.toHaveBeenCalled();
  });

  it('returns permanent error for empty message', async () => {
    const xDirect = mockXDirectWrite();
    const exec = new DmExecutor(fakeRegistry(), xDirect);

    const result = await exec.execute(fakeAction({ target_handle: 'a', message: '   ' }, 'dm'), fakeSession());

    expect(result).toEqual({ ok: false, errorClass: 'permanent', message: expect.stringContaining('required') });
    expect(xDirect.sendDm).not.toHaveBeenCalled();
  });

  it('returns errorClass=auth on AuthRequiredError', async () => {
    const xDirect = mockXDirectWrite({ sendDm: jest.fn().mockRejectedValue(authError()) });
    const exec = new DmExecutor(fakeRegistry(), xDirect);

    const result = await exec.execute(
      fakeAction({ target_handle: 'a', message: 'x' }, 'dm'),
      fakeSession(),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorClass).toBe('auth');
  });

  it('returns errorClass=transient on generic errors', async () => {
    const xDirect = mockXDirectWrite({ sendDm: jest.fn().mockRejectedValue(new Error('rate limit')) });
    const exec = new DmExecutor(fakeRegistry(), xDirect);

    const result = await exec.execute(
      fakeAction({ target_handle: 'a', message: 'x' }, 'dm'),
      fakeSession(),
    );

    expect(result).toEqual({ ok: false, errorClass: 'transient', message: 'rate limit' });
  });

  it('registers itself on bootstrap', () => {
    const registry = fakeRegistry();
    const exec = new DmExecutor(registry, mockXDirectWrite());
    exec.onApplicationBootstrap();
    expect(registry.register).toHaveBeenCalledWith(exec);
  });
});
