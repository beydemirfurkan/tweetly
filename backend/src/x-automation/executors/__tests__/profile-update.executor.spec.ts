import { ProfileUpdateExecutor } from './profile-update.executor';
import { authError, fakeAction, fakeRegistry, fakeSession, mockXDirectProfile } from './__tests__/test-helpers';

describe('ProfileUpdateExecutor', () => {
  it('delegates to xDirect.updateProfile with the parsed fields', async () => {
    const xDirect = mockXDirectProfile();
    const exec = new ProfileUpdateExecutor(fakeRegistry(), xDirect);
    const fields = { name: 'New', bio: 'Hi' };

    const result = await exec.execute(fakeAction({ fields }, 'profile_update'), fakeSession());

    expect(result).toEqual({ ok: true, result: { kind: 'engagement', at: expect.any(String) } });
    expect(xDirect.updateProfile).toHaveBeenCalledWith(fields, 'acc-1');
  });

  it('parses fields when the column was returned as a JSON string', async () => {
    const xDirect = mockXDirectProfile();
    const exec = new ProfileUpdateExecutor(fakeRegistry(), xDirect);
    // Some action-runner paths replay raw rows where fields is still a JSON
    // string rather than a parsed object — executor must handle both.
    const payload = { fields: '{"name":"Stringified"}' as unknown as Record<string, unknown> };

    await exec.execute(fakeAction(payload, 'profile_update'), fakeSession());

    expect(xDirect.updateProfile).toHaveBeenCalledWith({ name: 'Stringified' }, 'acc-1');
  });

  it('returns permanent error when no fields are present', async () => {
    const xDirect = mockXDirectProfile();
    const exec = new ProfileUpdateExecutor(fakeRegistry(), xDirect);

    const result = await exec.execute(fakeAction({ fields: {} }, 'profile_update'), fakeSession());

    expect(result).toEqual({ ok: false, errorClass: 'permanent', message: expect.stringContaining('no profile fields') });
    expect(xDirect.updateProfile).not.toHaveBeenCalled();
  });

  it('returns errorClass=auth on AuthRequiredError', async () => {
    const xDirect = mockXDirectProfile({ updateProfile: jest.fn().mockRejectedValue(authError()) });
    const exec = new ProfileUpdateExecutor(fakeRegistry(), xDirect);

    const result = await exec.execute(
      fakeAction({ fields: { name: 'A' } }, 'profile_update'),
      fakeSession(),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorClass).toBe('auth');
  });

  it('returns errorClass=transient on generic errors', async () => {
    const xDirect = mockXDirectProfile({ updateProfile: jest.fn().mockRejectedValue(new Error('boom')) });
    const exec = new ProfileUpdateExecutor(fakeRegistry(), xDirect);

    const result = await exec.execute(
      fakeAction({ fields: { name: 'A' } }, 'profile_update'),
      fakeSession(),
    );

    expect(result).toEqual({ ok: false, errorClass: 'transient', message: 'boom' });
  });

  it('registers itself on bootstrap', () => {
    const registry = fakeRegistry();
    const exec = new ProfileUpdateExecutor(registry, mockXDirectProfile());
    exec.onApplicationBootstrap();
    expect(registry.register).toHaveBeenCalledWith(exec);
  });
});
