import { IdempotencyKeyService } from './idempotency-key';

describe('IdempotencyKeyService', () => {
  const k = new IdempotencyKeyService();
  const date = new Date('2026-04-28T15:34:21Z');

  it('forPost is deterministic and includes hour bucket', () => {
    const a = k.forPost('alice', 'hello', date);
    const b = k.forPost('alice', 'hello', date);
    expect(a).toBe(b);
    expect(a).toMatch(/^post:alice:[0-9a-f]{8}:2026-04-28T15$/);
  });

  it('forPost differs for different texts', () => {
    expect(k.forPost('alice', 'a', date)).not.toBe(k.forPost('alice', 'b', date));
  });

  it('forReply uses parent tweet id and content hash', () => {
    expect(k.forReply('alice', '999', 'hi')).toMatch(/^reply:alice:999:[0-9a-f]{8}$/);
  });

  it('forLike / forBookmark / forRetweet have stable natural keys', () => {
    expect(k.forLike('alice', '123')).toBe('like:alice:123');
    expect(k.forBookmark('alice', '123')).toBe('bookmark:alice:123');
    expect(k.forRetweet('alice', '123')).toBe('retweet:alice:123');
  });

  it('forFollow uses target handle', () => {
    expect(k.forFollow('alice', 'bob')).toBe('follow:alice:bob');
  });

  it('forQuote includes tweet id and content hash', () => {
    expect(k.forQuote('alice', '123', 'hot take')).toMatch(/^quote:alice:123:[0-9a-f]{8}$/);
  });
});
