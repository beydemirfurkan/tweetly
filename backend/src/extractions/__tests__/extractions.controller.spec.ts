import { BadRequestException } from '@nestjs/common';
import { ExtractionsController } from '../extractions.controller';
import type { ExtractionService } from '../extraction.service';
import type { AccountFacade } from '@/public-api/facades/account.facade';

jest.mock('fs', () => ({
  ...jest.requireActual<typeof import('fs')>('fs'),
  createReadStream: jest.fn(() => ({})),
}));

function fakeRequest(userId = 'user-1'): any {
  // The controller pulls userId off ApiKeyGuard's auth context; the
  // mocked request carries it under `tweetlyAuth` exactly where
  // getAuthContext expects to find it.
  return {
    tweetlyAuth: { userId, scopes: ['read', 'write'], apiKeyId: 'k-1' },
  };
}

function makeController(overrides: {
  extractions?: Partial<jest.Mocked<ExtractionService>>;
  accounts?: Partial<jest.Mocked<AccountFacade>>;
} = {}): {
  ctrl: ExtractionsController;
  extractions: jest.Mocked<ExtractionService>;
  accounts: jest.Mocked<AccountFacade>;
} {
  const extractions = {
    validateAndEnqueue: jest.fn(),
    findForUser: jest.fn(),
    listForUser: jest.fn(),
    readableFile: jest.fn(),
    cancel: jest.fn(),
    ...overrides.extractions,
  } as unknown as jest.Mocked<ExtractionService>;
  const accounts = {
    resolveAccountIdOptional: jest.fn().mockResolvedValue('acc-1'),
    ...overrides.accounts,
  } as unknown as jest.Mocked<AccountFacade>;
  const ctrl = new ExtractionsController(extractions, accounts);
  return { ctrl, extractions, accounts };
}

describe('ExtractionsController.create', () => {
  it('resolves the account via AccountFacade, then enqueues with normalized fields', async () => {
    const { ctrl, extractions, accounts } = makeController({
      extractions: {
        validateAndEnqueue: jest.fn().mockResolvedValue({ id: 'job-1' }),
      },
    });

    const res = await ctrl.create(fakeRequest('user-1'), {
      type: 'user_followers',
      params: { handle: 'alice' },
      max_rows: 250,
      account: 'optional-acc',
    });

    expect(accounts.resolveAccountIdOptional).toHaveBeenCalledWith('user-1', 'optional-acc');
    expect(extractions.validateAndEnqueue).toHaveBeenCalledWith({
      userId: 'user-1',
      accountId: 'acc-1',
      type: 'user_followers',
      params: { handle: 'alice' },
      maxRows: 250,
    });
    expect(res).toEqual({ id: 'job-1' });
  });

  it("defaults max_rows to 1000 and params to '{}' when caller omits them", async () => {
    const { ctrl, extractions } = makeController();

    await ctrl.create(fakeRequest(), {
      type: 'user_followers',
    } as any);

    expect(extractions.validateAndEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ maxRows: 1000, params: {} }),
    );
  });

  it('passes accountId=null when the user has no active account to default to', async () => {
    const { ctrl, extractions } = makeController({
      accounts: { resolveAccountIdOptional: jest.fn().mockResolvedValue(undefined) },
    });
    await ctrl.create(fakeRequest(), { type: 'user_followers', params: { handle: 'a' } });
    expect(extractions.validateAndEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: null }),
    );
  });

  it("rejects with BadRequest when body isn't an object", async () => {
    const { ctrl } = makeController();
    await expect(ctrl.create(fakeRequest(), null as any)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ExtractionsController.get', () => {
  it('delegates straight to extractions.findForUser, scoped to the auth userId', async () => {
    const { ctrl, extractions } = makeController({
      extractions: { findForUser: jest.fn().mockResolvedValue({ id: 'job-1', status: 'running' }) },
    });
    const res = await ctrl.get(fakeRequest('user-1'), 'job-1');
    expect(extractions.findForUser).toHaveBeenCalledWith('job-1', 'user-1');
    expect(res).toEqual({ id: 'job-1', status: 'running' });
  });
});

describe('ExtractionsController.list', () => {
  it('caps limit at 100', async () => {
    const { ctrl, extractions } = makeController({
      extractions: { listForUser: jest.fn().mockResolvedValue([]) },
    });
    await ctrl.list(fakeRequest('user-1'), '500');
    expect(extractions.listForUser).toHaveBeenCalledWith('user-1', 100);
  });

  it('defaults limit to 20 when the query is missing', async () => {
    const { ctrl, extractions } = makeController({
      extractions: { listForUser: jest.fn().mockResolvedValue([]) },
    });
    await ctrl.list(fakeRequest('user-1'), undefined as any);
    expect(extractions.listForUser).toHaveBeenCalledWith('user-1', 20);
  });
});

describe('ExtractionsController.cancel', () => {
  it('returns 204 (void) when the service confirms the cancel', async () => {
    const { ctrl, extractions } = makeController({
      extractions: { cancel: jest.fn().mockResolvedValue(true) },
    });
    await expect(ctrl.cancel(fakeRequest('user-1'), 'job-1')).resolves.toBeUndefined();
    expect(extractions.cancel).toHaveBeenCalledWith('job-1', 'user-1');
  });

  it('throws BadRequest when the service returns false (not found or already terminal)', async () => {
    const { ctrl } = makeController({
      extractions: { cancel: jest.fn().mockResolvedValue(false) },
    });
    await expect(ctrl.cancel(fakeRequest('user-1'), 'job-1')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ExtractionsController.download', () => {
  it('sets the JSONL content headers and streams the resolved file', async () => {
    const { ctrl, extractions } = makeController({
      extractions: {
        findForUser: jest
          .fn()
          .mockResolvedValue({ id: 'job-1', status: 'succeeded', filePath: '/tmp/x.jsonl' }),
        readableFile: jest.fn().mockResolvedValue('/tmp/x.jsonl'),
      },
    });
    const setSpy = jest.fn();
    const res = { set: setSpy } as any;

    const file = await ctrl.download(fakeRequest('user-1'), 'job-1', res);

    expect(extractions.findForUser).toHaveBeenCalledWith('job-1', 'user-1');
    expect(extractions.readableFile).toHaveBeenCalledWith({
      id: 'job-1',
      status: 'succeeded',
      filePath: '/tmp/x.jsonl',
    });
    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        'Content-Type': 'application/x-ndjson',
        'Content-Disposition': expect.stringContaining('extraction-job-1.jsonl'),
      }),
    );
    expect(file).toBeDefined();
  });
});
