import { AccountSettingsHandler } from '../account-settings.handler';
import { fakeContext } from './test-helpers';
import type { SettingsService } from '@/settings/settings.service';
import type { DataSource } from 'typeorm';

function build() {
  const settings = {
    getDefs: jest.fn().mockReturnValue([{ key: 'foo', defaultValue: 'bar', type: 'string' }]),
    get: jest.fn().mockResolvedValue('val'),
    invalidateCache: jest.fn(),
  } as unknown as jest.Mocked<SettingsService>;

  const upsert = jest.fn().mockResolvedValue(undefined);
  const dataSource = {
    getRepository: jest.fn().mockReturnValue({ upsert }),
  } as unknown as jest.Mocked<DataSource>;

  return { handler: new AccountSettingsHandler(settings, dataSource), settings, upsert };
}

describe('AccountSettingsHandler.getSettings', () => {
  it('requires account_id', async () => {
    const { handler } = build();
    await expect(handler.getSettings({}, fakeContext())).rejects.toThrow(/account_id/);
  });

  it('returns a key→value map for the account', async () => {
    const { handler } = build();
    const result = await handler.getSettings({ account_id: 'acc-1' }, fakeContext());
    expect(result).toEqual({ foo: 'val' });
  });
});

describe('AccountSettingsHandler.updateSettings', () => {
  it('rejects non-object payload', async () => {
    const { handler } = build();
    await expect(
      handler.updateSettings({ account_id: 'acc-1', settings: 'not-an-object' }, fakeContext()),
    ).rejects.toThrow(/settings must be an object/);
  });

  it('stores allowlisted keys with their declared types', async () => {
    const { handler, upsert, settings } = build();
    settings.getDefs.mockReturnValue([
      { key: 's', defaultValue: '', type: 'string' },
      { key: 'n', defaultValue: 0, type: 'number' },
      { key: 'b', defaultValue: false, type: 'boolean' },
      { key: 'j', defaultValue: {}, type: 'json' },
    ]);

    const result = await handler.updateSettings(
      { account_id: 'acc-1', settings: { s: 'hi', n: 42, b: true, j: { k: 1 } } },
      fakeContext(),
    );

    expect(upsert).toHaveBeenCalledTimes(4);
    expect(upsert.mock.calls[0][0]).toMatchObject({ key: 's', type: 'string', value: 'hi' });
    expect(upsert.mock.calls[1][0]).toMatchObject({ key: 'n', type: 'number', value: '42' });
    expect(upsert.mock.calls[2][0]).toMatchObject({ key: 'b', type: 'boolean', value: 'true' });
    expect(upsert.mock.calls[3][0]).toMatchObject({ key: 'j', type: 'json', value: '{"k":1}' });
    expect(settings.invalidateCache).toHaveBeenCalled();
    expect(result).toEqual({ ok: true, updated: 4 });
  });

  it('rejects unknown keys without writing them', async () => {
    const { handler, upsert } = build();

    await expect(
      handler.updateSettings(
        { account_id: 'acc-1', settings: { 'secrets.admin_token': 'x' } },
        fakeContext(),
      ),
    ).rejects.toThrow(/Unknown setting: secrets\.admin_token/);

    expect(upsert).not.toHaveBeenCalled();
  });

  it('validates all keys before writing any rows', async () => {
    const { handler, settings, upsert } = build();
    settings.getDefs.mockReturnValue([{ key: 'max_attempts', defaultValue: 3, type: 'number' }]);

    await expect(
      handler.updateSettings(
        { account_id: 'acc-1', settings: { max_attempts: 5, 'secrets.admin_token': 'x' } },
        fakeContext(),
      ),
    ).rejects.toThrow(/Unknown setting: secrets\.admin_token/);

    expect(upsert).not.toHaveBeenCalled();
  });

  it('rejects values that do not match the setting type', async () => {
    const { handler, settings, upsert } = build();
    settings.getDefs.mockReturnValue([{ key: 'max_attempts', defaultValue: 3, type: 'number' }]);

    await expect(
      handler.updateSettings(
        { account_id: 'acc-1', settings: { max_attempts: 'many' } },
        fakeContext(),
      ),
    ).rejects.toThrow(/max_attempts must be number/);

    expect(upsert).not.toHaveBeenCalled();
  });
});
