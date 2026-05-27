import { ActionStrategyRegistry } from '../action-strategy.registry';
import { ACTION_TYPES } from '@domain/types/action.types';
import { IdempotencyKeyService } from '@domain/services/idempotency-key';
import { PostActionStrategy } from '../post.strategy';
import { ReplyActionStrategy } from '../reply.strategy';
import { QuoteActionStrategy } from '../quote.strategy';
import { LikeActionStrategy } from '../like.strategy';
import { BookmarkActionStrategy } from '../bookmark.strategy';
import { RetweetActionStrategy } from '../retweet.strategy';
import { UnlikeActionStrategy } from '../unlike.strategy';
import { UnretweetActionStrategy } from '../unretweet.strategy';
import { DeleteTweetActionStrategy } from '../delete-tweet.strategy';
import { FollowActionStrategy } from '../follow.strategy';
import { UnfollowActionStrategy } from '../unfollow.strategy';
import { DmActionStrategy } from '../dm.strategy';
import { ProfileUpdateActionStrategy } from '../profile-update.strategy';
import { AvatarUpdateActionStrategy } from '../avatar-update.strategy';
import { BannerUpdateActionStrategy } from '../banner-update.strategy';

function buildAllStrategies() {
  const keys = new IdempotencyKeyService();
  return [
    new PostActionStrategy(keys),
    new ReplyActionStrategy(keys),
    new QuoteActionStrategy(keys),
    new LikeActionStrategy(keys),
    new BookmarkActionStrategy(keys),
    new RetweetActionStrategy(keys),
    new UnlikeActionStrategy(keys),
    new UnretweetActionStrategy(keys),
    new DeleteTweetActionStrategy(keys),
    new FollowActionStrategy(keys),
    new UnfollowActionStrategy(keys),
    new DmActionStrategy(keys),
    new ProfileUpdateActionStrategy(keys),
    new AvatarUpdateActionStrategy(keys),
    new BannerUpdateActionStrategy(keys),
  ];
}

describe('ActionStrategyRegistry', () => {
  it('covers every ACTION_TYPES member (drift guard)', () => {
    const registry = new ActionStrategyRegistry(buildAllStrategies());
    for (const t of ACTION_TYPES) {
      expect(registry.forType(t).type).toBe(t);
    }
  });

  it('throws if any ACTION_TYPES member is missing a strategy', () => {
    const subset = buildAllStrategies().filter((s) => s.type !== 'bookmark');
    expect(() => new ActionStrategyRegistry(subset)).toThrow(/Missing action strategies for: bookmark/);
  });

  it('throws on duplicate registrations', () => {
    const keys = new IdempotencyKeyService();
    const all = [...buildAllStrategies(), new PostActionStrategy(keys)];
    expect(() => new ActionStrategyRegistry(all)).toThrow(/Duplicate action strategy registered for type=post/);
  });

  it('forType throws when registry was built without that strategy and slipped past constructor (defensive)', () => {
    const registry = new ActionStrategyRegistry(buildAllStrategies());
    // intentionally tamper to simulate an internal inconsistency
    (registry as unknown as { map: Map<string, unknown> }).map.delete('post');
    expect(() => registry.forType('post')).toThrow(/No strategy registered for action type: post/);
  });
});
