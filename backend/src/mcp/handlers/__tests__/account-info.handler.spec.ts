import { AccountInfoHandler } from '../account-info.handler';
import { fakeContext } from './test-helpers';
import type { AccountsService } from '@/accounts/accounts.service';

function build() {
  const accounts = {
    listAllForUser: jest.fn().mockResolvedValue([]),
    findByIdForUser: jest.fn().mockResolvedValue(null),
    getSessionHealth: jest.fn().mockResolvedValue({ paused: false }),
  } as unknown as jest.Mocked<AccountsService>;
  return { handler: new AccountInfoHandler(accounts), accounts };
}

describe('AccountInfoHandler.getAccounts', () => {
  it('returns the accounts list with stripped/derived fields', async () => {
    const { handler, accounts } = build();
    accounts.listAllForUser.mockResolvedValue([
      { id: 'a', displayName: 'A', status: 'active', authToken: 'tok', createdAt: new Date(0), lastUsedAt: null } as never,
    ]);

    const result = await handler.getAccounts({}, fakeContext());

    expect(result.count).toBe(1);
    expect(result.accounts[0]).toMatchObject({ id: 'a', hasAuthToken: true, status: 'active' });
    // Sensitive fields like authToken itself should NOT leak
    expect((result.accounts[0] as Record<string, unknown>).authToken).toBeUndefined();
  });
});
