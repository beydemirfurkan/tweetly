import { decodeCursor, encodeCursor } from './pagination.util';

describe('pagination cursor', () => {
  it('round-trips the payload', () => {
    const enc = encodeCursor({
      k: 'tweet-list',
      key: 'https://x.com/u/status/123',
      depth: 5,
    });
    const dec = decodeCursor(enc, 'tweet-list');
    expect(dec).toEqual({
      v: 1,
      k: 'tweet-list',
      key: 'https://x.com/u/status/123',
      depth: 5,
    });
  });

  it('rejects a cursor minted for a different list kind', () => {
    const enc = encodeCursor({ k: 'tweet-list', key: 'foo', depth: 0 });
    expect(() => decodeCursor(enc, 'user-list')).toThrow(/expected kind 'user-list'/);
  });

  it('rejects garbage', () => {
    expect(() => decodeCursor('not-base64', 'tweet-list')).toThrow(/invalid cursor/);
    // A valid base64url string but not JSON.
    expect(() => decodeCursor('Zm9v', 'tweet-list')).toThrow(/invalid cursor/);
  });

  it('rejects a payload missing required fields', () => {
    const half = Buffer.from('{"v":1,"k":"tweet-list"}', 'utf8').toString('base64url');
    expect(() => decodeCursor(half, 'tweet-list')).toThrow(/missing fields/);
  });

  it('round-trips an optional seen list', () => {
    const enc = encodeCursor({
      k: 'tweet-list',
      key: 'https://x.com/u/status/123',
      depth: 2,
      seen: ['a', 'b', 'c'],
    });
    const dec = decodeCursor(enc, 'tweet-list');
    expect(dec.seen).toEqual(['a', 'b', 'c']);
  });

  it('caps the seen list at SEEN_LIST_CAP entries (keeps the most recent)', () => {
    const longSeen = Array.from({ length: 75 }, (_, i) => `key-${i}`);
    const enc = encodeCursor({
      k: 'tweet-list',
      key: 'last',
      depth: 0,
      seen: longSeen,
    });
    const dec = decodeCursor(enc, 'tweet-list');
    expect(dec.seen).toHaveLength(50);
    // Keeps the trailing 50 (the freshest items).
    expect(dec.seen?.[0]).toBe('key-25');
    expect(dec.seen?.[49]).toBe('key-74');
  });

  it('rejects a malformed seen field', () => {
    const bad = Buffer.from(
      '{"v":1,"k":"tweet-list","key":"x","depth":0,"seen":[1,2,3]}',
      'utf8',
    ).toString('base64url');
    expect(() => decodeCursor(bad, 'tweet-list')).toThrow(/seen must be string/);
  });
});
