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
});
