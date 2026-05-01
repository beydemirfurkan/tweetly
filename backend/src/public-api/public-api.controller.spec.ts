import type { Request } from 'express';

import type { AccountsService } from '../accounts/accounts.service';
import type { ProfileCacheService } from '../accounts/profile-cache.service';
import type { ActionEnqueueService } from '../action-engine/action-enqueue.service';
import type { AdminApiService } from '../admin-api/admin-api.service';
import type { CredentialCipherService } from '../common/crypto/credential-cipher.service';
import type { MonitoringService } from '../monitoring/monitoring.service';
import type { LoginJobsRepository } from '../x-automation/login/login-jobs.repository';
import type { XBrowserService } from '../x-automation/browser/x-browser.service';
import type { XDirectService } from '../x-automation/x-direct.service';
import { PublicApiController } from './public-api.controller';

function makeController(loginJobsOverrides: Partial<jest.Mocked<LoginJobsRepository>> = {}): {
  controller: PublicApiController;
  loginJobs: jest.Mocked<LoginJobsRepository>;
} {
  const loginJobs = {
    create: jest.fn().mockResolvedValue({ id: 'job-1' }),
    findActiveCooldown: jest.fn().mockResolvedValue(null),
    ...loginJobsOverrides,
  } as unknown as jest.Mocked<LoginJobsRepository>;
  const cipher = {
    encrypt: jest.fn((value: string) => `enc:${value}`),
  } as unknown as CredentialCipherService;
  const controller = new PublicApiController(
    {} as unknown as AccountsService,
    {} as unknown as ProfileCacheService,
    {} as unknown as ActionEnqueueService,
    {} as unknown as AdminApiService,
    {} as unknown as XDirectService,
    {} as unknown as XBrowserService,
    {} as unknown as MonitoringService,
    cipher,
    loginJobs,
  );
  return { controller, loginJobs };
}

function makeRequest(): Request {
  return {
    tweetlyAuth: { userId: 'user-1', apiKeyId: 'key-1', scopes: ['write'] },
  } as unknown as Request;
}

describe('PublicApiController.connectAccount', () => {
  it('queues a username-only login job when email is omitted', async () => {
    const { controller, loginJobs } = makeController();

    const response = await controller.connectAccount(makeRequest(), {
      username: '@test-account',
      password: 'secret',
    });

    expect(response).toEqual({
      jobId: 'job-1',
      kind: 'connect',
      pollUrl: '/api/v1/accounts/login-jobs/job-1',
    });
    expect(loginJobs.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      username: 'test-account',
      email: null,
      encryptedPassword: 'enc:secret',
    }));
  });

  it('blocks a new login job while cooldown is active', async () => {
    const { controller, loginJobs } = makeController({
      findActiveCooldown: jest.fn().mockResolvedValue({
        username: 'test-account',
        failureCount: 2,
        retryAfterSec: 120,
        retryAt: '2026-04-30T20:00:00.000Z',
        manualReviewRequired: false,
      }),
    });

    await expect(controller.connectAccount(makeRequest(), {
      username: 'test-account',
      password: 'secret',
    })).rejects.toMatchObject({ status: 429 });
    expect(loginJobs.create).not.toHaveBeenCalled();
  });
});
