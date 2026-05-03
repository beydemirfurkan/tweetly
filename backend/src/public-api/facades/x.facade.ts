import { BadRequestException, Injectable } from '@nestjs/common';
import {
  XDirectReadService,
  XDirectWriteService,
  XDirectProfileService,
} from '@/x-automation/x-direct';
import { XBrowserService } from '@/x-automation/browser/x-browser.service';
import { AccountFacade } from './account.facade';
import type {
  FollowBody,
  GetTweetBody,
  InteractionBody,
  SendDmBody,
  UpdateProfileBody,
} from '../dto/action.dto';

/**
 * Synchronous X read + undo/profile operations. Wraps the three XDirect
 * services + XBrowserService; controllers go through here so that account
 * resolution and parameter bounds (limits, URL shape) live in one place.
 */
@Injectable()
export class XFacade {
  constructor(
    private readonly reads: XDirectReadService,
    private readonly writes: XDirectWriteService,
    private readonly profile: XDirectProfileService,
    private readonly xBrowser: XBrowserService,
    private readonly accounts: AccountFacade,
  ) {}

  async searchTweets(userId: string, query: string, limitStr?: string, account?: string) {
    if (!query) throw new BadRequestException('query is required');
    const limit = Math.min(parseInt(limitStr ?? '20', 10), 50);
    const acct = await this.accounts.resolveAccountIdOptional(userId, account);
    return this.reads.searchTweets(query, limit, acct);
  }

  async searchUsers(userId: string, query: string, limitStr?: string, account?: string) {
    if (!query) throw new BadRequestException('query is required');
    const limit = Math.min(parseInt(limitStr ?? '20', 10), 50);
    const acct = await this.accounts.resolveAccountIdOptional(userId, account);
    return this.reads.searchUsers(query, limit, acct);
  }

  async getUser(userId: string, handle: string, account?: string) {
    const acct = await this.accounts.resolveAccountIdOptional(userId, account);
    return this.reads.getUser(handle, acct);
  }

  async getUserTweets(userId: string, handle: string, limitStr?: string, account?: string) {
    const limit = Math.min(parseInt(limitStr ?? '20', 10), 50);
    const acct = await this.accounts.resolveAccountIdOptional(userId, account);
    if (!acct) return [];
    return this.xBrowser.readProfileTweets(handle, limit, acct);
  }

  async getUserFollowers(userId: string, handle: string, limitStr?: string, account?: string) {
    const limit = Math.min(parseInt(limitStr ?? '50', 10), 200);
    const acct = await this.accounts.resolveAccountIdOptional(userId, account);
    return this.reads.getUserFollowers(handle, limit, acct);
  }

  async getTweet(userId: string, body: GetTweetBody) {
    if (!body.tweetUrl?.includes('/status/')) {
      throw new BadRequestException('tweetUrl must contain /status/');
    }
    const acct = await this.accounts.resolveAccountIdOptional(userId, body.account);
    return this.reads.getTweet(body.tweetUrl, acct);
  }

  async getXTrending(userId: string, account?: string) {
    const acct = await this.accounts.resolveAccountIdOptional(userId, account);
    return this.reads.getXTrending(acct);
  }

  async unlikeTweet(userId: string, body: InteractionBody) {
    const acct = await this.requireUrlAndAccount(userId, body);
    return this.writes.unlikeTweet(body.targetTweetUrl, acct);
  }

  async unretweet(userId: string, body: InteractionBody) {
    const acct = await this.requireUrlAndAccount(userId, body);
    return this.writes.unretweetTweet(body.targetTweetUrl, acct);
  }

  async deleteTweet(userId: string, body: InteractionBody) {
    const acct = await this.requireUrlAndAccount(userId, body);
    return this.writes.deleteTweet(body.targetTweetUrl, acct);
  }

  async unfollow(userId: string, body: FollowBody) {
    if (!body.targetHandle) throw new BadRequestException('targetHandle is required');
    const acct = await this.accounts.resolveAccountId(userId, body.account);
    return this.writes.unfollowAccount(body.targetHandle, acct);
  }

  async sendDm(userId: string, body: SendDmBody) {
    if (!body.targetHandle) throw new BadRequestException('targetHandle is required');
    if (!body.message) throw new BadRequestException('message is required');
    const acct = await this.accounts.resolveAccountId(userId, body.account);
    return this.writes.sendDm(body.targetHandle, body.message, acct);
  }

  async updateProfile(userId: string, body: UpdateProfileBody) {
    const fields = {
      name: body.name,
      bio: body.bio,
      location: body.location,
      website: body.website,
    };
    if (!Object.values(fields).some(Boolean)) {
      throw new BadRequestException('at least one of name, bio, location, website is required');
    }
    const acct = await this.accounts.resolveAccountId(userId, body.account);
    return this.profile.updateProfile(fields, acct);
  }

  private async requireUrlAndAccount(userId: string, body: InteractionBody): Promise<string> {
    if (!body.targetTweetUrl?.includes('/status/')) {
      throw new BadRequestException('targetTweetUrl must contain /status/');
    }
    return this.accounts.resolveAccountId(userId, body.account);
  }
}
