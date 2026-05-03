import { ApiProperty } from '@nestjs/swagger';

export class PostActionBody {
  @ApiProperty({ example: 'Hello from xtweetly', description: 'Tweet text (max 280 chars)' })
  text!: string;

  @ApiProperty({ required: false, description: 'Account ID to post from (uses first active account if omitted)' })
  account?: string;
}

export class ReplyActionBody {
  @ApiProperty({ example: 'Nice take!' })
  text!: string;

  @ApiProperty({ example: 'https://x.com/user/status/123', description: 'Must contain /status/' })
  parentTweetUrl!: string;

  @ApiProperty({ required: false })
  account?: string;
}

export class QuoteActionBody {
  @ApiProperty()
  text!: string;

  @ApiProperty({ description: 'Must contain /status/' })
  targetTweetUrl!: string;

  @ApiProperty({ required: false })
  account?: string;
}

export class InteractionBody {
  @ApiProperty({ description: 'Must contain /status/' })
  targetTweetUrl!: string;

  @ApiProperty({ required: false })
  account?: string;
}

export class FollowBody {
  @ApiProperty({ example: 'jack', description: 'Handle without @' })
  targetHandle!: string;

  @ApiProperty({ required: false })
  account?: string;
}

export class ThreadBody {
  @ApiProperty({ type: [String], example: ['first tweet', 'second tweet'] })
  tweets!: string[];

  @ApiProperty({ required: false })
  account?: string;
}

export class GetTweetBody {
  @ApiProperty({ description: 'Must contain /status/' })
  tweetUrl!: string;

  @ApiProperty({ required: false })
  account?: string;
}

export class SendDmBody {
  @ApiProperty({ description: 'Recipient handle (without @)' })
  targetHandle!: string;

  @ApiProperty({ description: 'Message text' })
  message!: string;

  @ApiProperty({ required: false })
  account?: string;
}

export class UpdateProfileBody {
  @ApiProperty({ required: false })
  name?: string;

  @ApiProperty({ required: false })
  bio?: string;

  @ApiProperty({ required: false })
  location?: string;

  @ApiProperty({ required: false })
  website?: string;

  @ApiProperty({ required: false })
  account?: string;
}

export class ActionEnqueueResponseDto {
  @ApiProperty({ format: 'uuid', nullable: true, description: 'Null when deduped to an existing pending row' })
  id!: string | null;

  @ApiProperty({ description: 'Deterministic dedup key for this action' })
  idempotencyKey!: string;
}
