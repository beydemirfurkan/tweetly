import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiKeyGuard, getAuthContext } from '@/auth/api-key.guard';
import { RequiresScope } from '@/auth/requires-scope.decorator';
import {
  RateLimitRead,
  TieredThrottlerGuard,
} from '@/auth/tiered-throttler.guard';
import { XFacade } from '../facades/x.facade';
import {
  FollowBody,
  GetTweetBody,
  InteractionBody,
  SendDmBody,
  UpdateProfileBody,
} from '../dto/action.dto';

@ApiBearerAuth('apiKey')
@Controller('api/v1')
@UseGuards(ApiKeyGuard, TieredThrottlerGuard)
@RequiresScope('write')
export class XController {
  constructor(private readonly x: XFacade) {}

  @Get('x/search/tweets')
  @ApiTags('x')
  @RequiresScope('read')
  @RateLimitRead()
  @ApiOperation({ summary: 'Search tweets matching a query (live)' })
  @ApiQuery({ name: 'query', required: true })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'account', required: false })
  @ApiQuery({ name: 'cursor', required: false, description: 'Opaque cursor from a previous nextCursor' })
  async searchTweets(
    @Req() req: Request,
    @Query('query') query: string,
    @Query('limit') limit: string,
    @Query('account') account: string,
    @Query('cursor') cursor: string,
  ) {
    return this.x.searchTweets(getAuthContext(req).userId, query, limit, account, cursor);
  }

  @Get('x/search/users')
  @ApiTags('x')
  @RequiresScope('read')
  @RateLimitRead()
  @ApiOperation({ summary: 'Search users by name or handle' })
  @ApiQuery({ name: 'cursor', required: false, description: 'Opaque cursor from a previous nextCursor' })
  async searchUsers(
    @Req() req: Request,
    @Query('query') query: string,
    @Query('limit') limit: string,
    @Query('account') account: string,
    @Query('cursor') cursor: string,
  ) {
    return this.x.searchUsers(getAuthContext(req).userId, query, limit, account, cursor);
  }

  @Get('x/users/:handle')
  @ApiTags('x')
  @RequiresScope('read')
  @RateLimitRead()
  @ApiOperation({ summary: 'Get a user profile' })
  async getUser(
    @Req() req: Request,
    @Param('handle') handle: string,
    @Query('account') account: string,
  ) {
    return this.x.getUser(getAuthContext(req).userId, handle, account);
  }

  @Get('x/users/:handle/tweets')
  @ApiTags('x')
  @RequiresScope('read')
  @RateLimitRead()
  @ApiOperation({ summary: "Get a user's recent tweets" })
  @ApiQuery({ name: 'cursor', required: false, description: 'Opaque cursor from a previous nextCursor' })
  async getUserTweets(
    @Req() req: Request,
    @Param('handle') handle: string,
    @Query('limit') limit: string,
    @Query('account') account: string,
    @Query('cursor') cursor: string,
  ) {
    return this.x.getUserTweets(getAuthContext(req).userId, handle, limit, account, cursor);
  }

  @Get('x/users/:handle/followers')
  @ApiTags('x')
  @RequiresScope('read')
  @RateLimitRead()
  @ApiOperation({ summary: "Get a user's followers" })
  @ApiQuery({ name: 'cursor', required: false, description: 'Opaque cursor from a previous nextCursor' })
  async getUserFollowers(
    @Req() req: Request,
    @Param('handle') handle: string,
    @Query('limit') limit: string,
    @Query('account') account: string,
    @Query('cursor') cursor: string,
  ) {
    return this.x.getUserFollowers(getAuthContext(req).userId, handle, limit, account, cursor);
  }

  @Post('x/tweets/get')
  @HttpCode(HttpStatus.OK)
  @ApiTags('x')
  @RequiresScope('read')
  @ApiOperation({ summary: 'Get tweet details by URL' })
  async getTweet(@Req() req: Request, @Body() body: GetTweetBody) {
    return this.x.getTweet(getAuthContext(req).userId, body);
  }

  @Get('x/trending')
  @ApiTags('x')
  @RequiresScope('read')
  @RateLimitRead()
  @ApiOperation({ summary: 'Get current X trending topics' })
  async getXTrending(@Req() req: Request, @Query('account') account: string) {
    return this.x.getXTrending(getAuthContext(req).userId, account);
  }

  @Get('x/users/:handle/likes')
  @ApiTags('x')
  @RequiresScope('read')
  @RateLimitRead()
  @ApiOperation({ summary: "Get tweets a user has liked" })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'account', required: false })
  @ApiQuery({ name: 'cursor', required: false, description: 'Opaque cursor from a previous nextCursor' })
  async getUserLikes(
    @Req() req: Request,
    @Param('handle') handle: string,
    @Query('limit') limit: string,
    @Query('account') account: string,
    @Query('cursor') cursor: string,
  ) {
    return this.x.getUserLikes(getAuthContext(req).userId, handle, limit, account, cursor);
  }

  @Get('x/me/bookmarks')
  @ApiTags('x')
  @RequiresScope('read')
  @RateLimitRead()
  @ApiOperation({ summary: "Get the calling account's own bookmarks" })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'account', required: false })
  @ApiQuery({ name: 'cursor', required: false, description: 'Opaque cursor from a previous nextCursor' })
  async getMyBookmarks(
    @Req() req: Request,
    @Query('limit') limit: string,
    @Query('account') account: string,
    @Query('cursor') cursor: string,
  ) {
    return this.x.getMyBookmarks(getAuthContext(req).userId, limit, account, cursor);
  }

  @Get('x/lists/:listId/members')
  @ApiTags('x')
  @RequiresScope('read')
  @RateLimitRead()
  @ApiOperation({ summary: 'Get members of a public X list by numeric ID' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'account', required: false })
  @ApiQuery({ name: 'cursor', required: false, description: 'Opaque cursor from a previous nextCursor' })
  async getListMembers(
    @Req() req: Request,
    @Param('listId') listId: string,
    @Query('limit') limit: string,
    @Query('account') account: string,
    @Query('cursor') cursor: string,
  ) {
    return this.x.getListMembers(getAuthContext(req).userId, listId, limit, account, cursor);
  }

  @Get('x/users/:handle/mutual-followers')
  @ApiTags('x')
  @RequiresScope('read')
  @RateLimitRead()
  @ApiOperation({
    summary: "Followers-you-know: accounts the calling user follows that also follow :handle",
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'account', required: false })
  @ApiQuery({ name: 'cursor', required: false, description: 'Opaque cursor from a previous nextCursor' })
  async getMutualFollowers(
    @Req() req: Request,
    @Param('handle') handle: string,
    @Query('limit') limit: string,
    @Query('account') account: string,
    @Query('cursor') cursor: string,
  ) {
    return this.x.getMutualFollowers(getAuthContext(req).userId, handle, limit, account, cursor);
  }

  @Get('x/users/:handle/lists')
  @ApiTags('x')
  @RequiresScope('read')
  @RateLimitRead()
  @ApiOperation({ summary: "Get the lists a user owns" })
  @ApiQuery({ name: 'account', required: false })
  async getUserLists(
    @Req() req: Request,
    @Param('handle') handle: string,
    @Query('account') account: string,
  ) {
    return this.x.getUserLists(getAuthContext(req).userId, handle, account);
  }

  @Get('x/lists/:listId')
  @ApiTags('x')
  @RequiresScope('read')
  @RateLimitRead()
  @ApiOperation({ summary: 'Get list metadata (name, description, member + subscriber counts, owner)' })
  @ApiQuery({ name: 'account', required: false })
  async getList(
    @Req() req: Request,
    @Param('listId') listId: string,
    @Query('account') account: string,
  ) {
    return this.x.getList(getAuthContext(req).userId, listId, account);
  }

  @Get('x/lists/:listId/subscribers')
  @ApiTags('x')
  @RequiresScope('read')
  @RateLimitRead()
  @ApiOperation({ summary: 'Get subscribers of a public X list (paginated)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'account', required: false })
  @ApiQuery({ name: 'cursor', required: false, description: 'Opaque cursor from a previous nextCursor' })
  async getListSubscribers(
    @Req() req: Request,
    @Param('listId') listId: string,
    @Query('limit') limit: string,
    @Query('account') account: string,
    @Query('cursor') cursor: string,
  ) {
    return this.x.getListSubscribers(getAuthContext(req).userId, listId, limit, account, cursor);
  }

  @Post('x/tweets/thread')
  @HttpCode(HttpStatus.OK)
  @ApiTags('x')
  @RequiresScope('read')
  @RateLimitRead()
  @ApiOperation({
    summary: 'Get the same-author thread chain rooted at a tweet (root tweet first)',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getThread(
    @Req() req: Request,
    @Body() body: GetTweetBody,
    @Query('limit') limit: string,
  ) {
    return this.x.getThread(getAuthContext(req).userId, body, limit);
  }

  @Post('x/tweets/unlike')
  @HttpCode(HttpStatus.OK)
  @ApiTags('x')
  @ApiOperation({ summary: 'Remove a like (synchronous)' })
  async unlikeTweet(@Req() req: Request, @Body() body: InteractionBody) {
    return this.x.unlikeTweet(getAuthContext(req).userId, body);
  }

  @Post('x/tweets/unretweet')
  @HttpCode(HttpStatus.OK)
  @ApiTags('x')
  @ApiOperation({ summary: 'Undo a retweet (synchronous)' })
  async unretweet(@Req() req: Request, @Body() body: InteractionBody) {
    return this.x.unretweet(getAuthContext(req).userId, body);
  }

  @Post('x/tweets/delete')
  @HttpCode(HttpStatus.OK)
  @ApiTags('x')
  @ApiOperation({ summary: 'Delete a tweet (synchronous)' })
  async deleteTweet(@Req() req: Request, @Body() body: InteractionBody) {
    return this.x.deleteTweet(getAuthContext(req).userId, body);
  }

  @Post('x/follows/unfollow')
  @HttpCode(HttpStatus.OK)
  @ApiTags('x')
  @ApiOperation({ summary: 'Unfollow an account (synchronous)' })
  async unfollow(@Req() req: Request, @Body() body: FollowBody) {
    return this.x.unfollow(getAuthContext(req).userId, body);
  }

  @Post('x/dm/send')
  @HttpCode(HttpStatus.OK)
  @ApiTags('x')
  @ApiOperation({ summary: 'Send a direct message' })
  async sendDm(@Req() req: Request, @Body() body: SendDmBody) {
    return this.x.sendDm(getAuthContext(req).userId, body);
  }

  @Put('x/profile')
  @HttpCode(HttpStatus.OK)
  @ApiTags('x')
  @ApiOperation({ summary: 'Update profile fields (name/bio/location/website)' })
  async updateProfile(@Req() req: Request, @Body() body: UpdateProfileBody) {
    return this.x.updateProfile(getAuthContext(req).userId, body);
  }
}
