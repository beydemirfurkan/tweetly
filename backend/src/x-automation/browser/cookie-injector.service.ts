import { Injectable, Logger } from '@nestjs/common';
import type { BrowserContext } from 'patchright';
import { AccountsService } from '@/accounts/accounts.service';

const X_COOKIE_DOMAIN = '.x.com';
const X_COOKIE_PATH = '/';

/**
 * Restores the auth_token / ct0 cookies for the given account so the
 * launched Patchright context starts the session already authenticated
 * against X without re-running the login flow.
 */
@Injectable()
export class CookieInjectorService {
  private readonly log = new Logger(CookieInjectorService.name);

  constructor(private readonly accounts: AccountsService) {}

  async inject(context: BrowserContext, accountId: string): Promise<void> {
    const account = await this.accounts.findById(accountId);
    if (!account?.authToken) return;

    const cookies = [
      {
        name: 'auth_token',
        value: account.authToken,
        domain: X_COOKIE_DOMAIN,
        path: X_COOKIE_PATH,
        httpOnly: true,
        secure: true,
        sameSite: 'None' as const,
      },
    ];

    if (account.ct0) {
      cookies.push({
        name: 'ct0',
        value: account.ct0,
        domain: X_COOKIE_DOMAIN,
        path: X_COOKIE_PATH,
        httpOnly: false,
        secure: true,
        sameSite: 'None' as const,
      });
    }

    await context.addCookies(cookies);
    this.log.log(`Cookies injected for account ${accountId}`);
  }
}
