import { ProfileAnalyzerService } from './profile-analyzer.service';
import type { OpenRouterService } from './openrouter.service';
import type { XDirectReadService } from '@/x-automation/x-direct/x-direct-read.service';
import type { TweetResult, UserResult } from '@/x-automation/x-direct';

const SAMPLE_STYLE = {
  tone: ['witty', 'concise'],
  avgLength: 180,
  hashtagUsage: 0.1,
  emojiUsage: 0.2,
  topTopics: ['typescript', 'devtools'],
  contentStyle: 'short_punchy',
  postingPattern: 'daily',
  engagementStyle: 'replies fast',
  summary: 'a witty, concise voice',
};

function fakeUser(overrides: Partial<UserResult> = {}): UserResult {
  return {
    handle: 'alice',
    displayName: 'Alice',
    bio: 'building things',
    followersCount: '1234',
    followingCount: '321',
    tweetsCount: '987',
    verified: false,
    profileUrl: 'https://x.com/alice',
    profileImageUrl: '',
    ...overrides,
  };
}

function fakeTweet(text: string): TweetResult {
  return {
    text,
    handle: 'alice',
    url: 'https://x.com/alice/status/1',
    postedAt: '2026-01-01T00:00:00Z',
    likeCount: '0',
    retweetCount: '0',
    replyCount: '0',
  } as TweetResult;
}

function makeService(
  mockChat: jest.Mock,
  reads: Partial<jest.Mocked<XDirectReadService>>,
): { svc: ProfileAnalyzerService } {
  const ai = { chat: mockChat } as unknown as jest.Mocked<OpenRouterService>;
  const xRead = reads as unknown as jest.Mocked<XDirectReadService>;
  const svc = new ProfileAnalyzerService(ai, xRead);
  return { svc };
}

describe('ProfileAnalyzerService.analyzeProfile', () => {
  it('parses the AI response and returns a structured ProfileAnalysisResult', async () => {
    const chat = jest.fn().mockResolvedValue({ content: JSON.stringify(SAMPLE_STYLE) });

    const getUser = jest.fn().mockResolvedValue(fakeUser());
    const getUserTweets = jest
      .fn()
      .mockResolvedValue({ items: [fakeTweet('hello'), fakeTweet('world')], nextCursor: null });

    const { svc } = makeService(chat, { getUser, getUserTweets });

    const result = await svc.analyzeProfile('alice', 'acc-1');

    expect(result.handle).toBe('alice');
    expect(result.displayName).toBe('Alice');
    expect(result.bio).toBe('building things');
    expect(result.followersCount).toBe(1234); // parsed
    expect(result.followingCount).toBe(321);
    expect(result.tweetsAnalyzed).toBe(2);
    expect(result.styleProfile).toEqual(SAMPLE_STYLE);
    expect(result.analyzedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("treats non-numeric followers/following as zero (no NaN slipping through)", async () => {
    const chat = jest.fn().mockResolvedValue({ content: JSON.stringify(SAMPLE_STYLE) });
    const getUser = jest.fn().mockResolvedValue(fakeUser({ followersCount: 'N/A', followingCount: '' }));
    const getUserTweets = jest.fn().mockResolvedValue({ items: [], nextCursor: null });

    const { svc } = makeService(chat, { getUser, getUserTweets });
    const result = await svc.analyzeProfile('alice');

    expect(result.followersCount).toBe(0);
    expect(result.followingCount).toBe(0);
  });

  it('strips ```json fences before parsing the style profile', async () => {
    const fenced = '```json\n' + JSON.stringify(SAMPLE_STYLE) + '\n```';
    const chat = jest.fn().mockResolvedValue({ content: fenced });
    const getUser = jest.fn().mockResolvedValue(fakeUser());
    const getUserTweets = jest.fn().mockResolvedValue({ items: [], nextCursor: null });

    const { svc } = makeService(chat, { getUser, getUserTweets });
    const result = await svc.analyzeProfile('alice');
    expect(result.styleProfile).toEqual(SAMPLE_STYLE);
  });

  it('throws a friendly error when the AI returns malformed JSON', async () => {
    const chat = jest.fn().mockResolvedValue({ content: 'not json' });
    const getUser = jest.fn().mockResolvedValue(fakeUser());
    const getUserTweets = jest.fn().mockResolvedValue({ items: [], nextCursor: null });

    const { svc } = makeService(chat, { getUser, getUserTweets });
    await expect(svc.analyzeProfile('alice')).rejects.toThrow(/invalid JSON for style profile/);
  });

  it('throws when the user lookup returns null (handle not found)', async () => {
    const chat = jest.fn();
    const getUser = jest.fn().mockResolvedValue(null);
    const getUserTweets = jest.fn();

    const { svc } = makeService(chat, { getUser, getUserTweets });
    await expect(svc.analyzeProfile('nobody')).rejects.toThrow(/not found/);
    expect(chat).not.toHaveBeenCalled();
    expect(getUserTweets).not.toHaveBeenCalled();
  });

  it('forwards the AI temperature/maxTokens used for style extraction (low temp for deterministic output)', async () => {
    const chat = jest.fn().mockResolvedValue({ content: JSON.stringify(SAMPLE_STYLE) });
    const getUser = jest.fn().mockResolvedValue(fakeUser());
    const getUserTweets = jest.fn().mockResolvedValue({ items: [], nextCursor: null });

    const { svc } = makeService(chat, { getUser, getUserTweets });
    await svc.analyzeProfile('alice');

    expect(chat).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ temperature: 0.3, maxTokens: 2048 }),
    );
  });
});
