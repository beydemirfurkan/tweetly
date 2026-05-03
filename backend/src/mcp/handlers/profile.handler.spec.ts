import { ProfileHandler } from './profile.handler';
import { fakeContext } from './__tests__/test-helpers';
import type { ActionEnqueueService } from '@/action-engine/action-enqueue.service';

function mockEnqueue(): jest.Mocked<ActionEnqueueService> {
  const r = Promise.resolve({ id: 'a-1', idempotencyKey: 'k-1' });
  return {
    enqueueUnlike: jest.fn().mockReturnValue(r),
    enqueueUnretweet: jest.fn().mockReturnValue(r),
    enqueueUnfollow: jest.fn().mockReturnValue(r),
    enqueueDeleteTweet: jest.fn().mockReturnValue(r),
    enqueueDm: jest.fn().mockReturnValue(r),
    enqueueProfileUpdate: jest.fn().mockReturnValue(r),
    enqueueAvatarUpdate: jest.fn().mockReturnValue(r),
    enqueueBannerUpdate: jest.fn().mockReturnValue(r),
  } as unknown as jest.Mocked<ActionEnqueueService>;
}

describe('ProfileHandler', () => {
  const url = 'https://x.com/u/status/1';

  describe('tweet_url validation', () => {
    it.each([
      ['unlikeTweet', 'enqueueUnlike'],
      ['unretweet', 'enqueueUnretweet'],
      ['deleteTweet', 'enqueueDeleteTweet'],
    ] as const)('%s rejects URL without /status/', async (method, enqMethod) => {
      const enq = mockEnqueue();
      const h = new ProfileHandler(enq);
      await expect((h[method] as (a: unknown, c: unknown) => unknown)({ tweet_url: 'invalid' }, fakeContext()))
        .rejects.toThrow(/\/status\//);
      expect((enq[enqMethod] as jest.Mock)).not.toHaveBeenCalled();
    });

    it.each([
      ['unlikeTweet', 'enqueueUnlike'],
      ['unretweet', 'enqueueUnretweet'],
      ['deleteTweet', 'enqueueDeleteTweet'],
    ] as const)('%s enqueues with the resolved account on valid URL', async (method, enqMethod) => {
      const enq = mockEnqueue();
      const ctx = fakeContext();
      const h = new ProfileHandler(enq);
      const result = await (h[method] as (a: unknown, c: unknown) => Promise<unknown>)(
        { tweet_url: url, account_id: 'acc-9' },
        ctx,
      );
      expect(ctx.resolveAccountId).toHaveBeenCalledWith('acc-9');
      expect((enq[enqMethod] as jest.Mock)).toHaveBeenCalledWith(expect.objectContaining({
        accountId: 'acc-1', targetTweetUrl: url, metadata: { source: 'mcp' },
      }));
      expect(result).toEqual({ id: 'a-1', idempotencyKey: 'k-1' });
    });
  });

  describe('unfollowAccount', () => {
    it('throws on empty target_handle', async () => {
      const h = new ProfileHandler(mockEnqueue());
      await expect(h.unfollowAccount({}, fakeContext())).rejects.toThrow(/target_handle/);
    });

    it('enqueues on valid handle', async () => {
      const enq = mockEnqueue();
      const h = new ProfileHandler(enq);
      await h.unfollowAccount({ target_handle: 'elonmusk' }, fakeContext());
      expect(enq.enqueueUnfollow).toHaveBeenCalledWith(expect.objectContaining({ targetHandle: 'elonmusk' }));
    });
  });

  describe('sendDm', () => {
    it('requires target_handle', async () => {
      const h = new ProfileHandler(mockEnqueue());
      await expect(h.sendDm({ message: 'hi' }, fakeContext())).rejects.toThrow(/target_handle/);
    });

    it('requires message', async () => {
      const h = new ProfileHandler(mockEnqueue());
      await expect(h.sendDm({ target_handle: 'a' }, fakeContext())).rejects.toThrow(/message/);
    });

    it('enqueues both fields on success', async () => {
      const enq = mockEnqueue();
      const h = new ProfileHandler(enq);
      await h.sendDm({ target_handle: 'a', message: 'hi' }, fakeContext());
      expect(enq.enqueueDm).toHaveBeenCalledWith(expect.objectContaining({ targetHandle: 'a', message: 'hi' }));
    });
  });

  describe('updateProfile', () => {
    it('throws when no field is provided', async () => {
      const h = new ProfileHandler(mockEnqueue());
      await expect(h.updateProfile({}, fakeContext())).rejects.toThrow(/at least one of/i);
    });

    it('enqueues only the provided fields (omits undefined)', async () => {
      const enq = mockEnqueue();
      const h = new ProfileHandler(enq);
      await h.updateProfile({ name: 'New', bio: 'Hi' }, fakeContext());
      expect(enq.enqueueProfileUpdate).toHaveBeenCalledWith(expect.objectContaining({
        fields: { name: 'New', bio: 'Hi' },
      }));
    });

    it('preserves empty strings as intentional clears', async () => {
      const enq = mockEnqueue();
      const h = new ProfileHandler(enq);
      // empty bio is "user wants to clear it" — should be enqueued
      await h.updateProfile({ bio: '' }, fakeContext());
      expect(enq.enqueueProfileUpdate).toHaveBeenCalledWith(expect.objectContaining({
        fields: { bio: '' },
      }));
    });
  });

  describe('updateAvatar / updateBanner', () => {
    it('updateAvatar requires file_path', async () => {
      const h = new ProfileHandler(mockEnqueue());
      await expect(h.updateAvatar({}, fakeContext())).rejects.toThrow(/file_path/);
    });

    it('updateBanner requires file_path', async () => {
      const h = new ProfileHandler(mockEnqueue());
      await expect(h.updateBanner({}, fakeContext())).rejects.toThrow(/file_path/);
    });

    it('updateAvatar enqueues with the file path', async () => {
      const enq = mockEnqueue();
      const h = new ProfileHandler(enq);
      await h.updateAvatar({ file_path: '/tmp/a.jpg' }, fakeContext());
      expect(enq.enqueueAvatarUpdate).toHaveBeenCalledWith(expect.objectContaining({ filePath: '/tmp/a.jpg' }));
    });

    it('updateBanner enqueues with the file path', async () => {
      const enq = mockEnqueue();
      const h = new ProfileHandler(enq);
      await h.updateBanner({ file_path: '/tmp/b.jpg' }, fakeContext());
      expect(enq.enqueueBannerUpdate).toHaveBeenCalledWith(expect.objectContaining({ filePath: '/tmp/b.jpg' }));
    });
  });
});
