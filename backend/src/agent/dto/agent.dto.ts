import { ApiProperty } from '@nestjs/swagger';

export class CreateAgentConfigDto {
  @ApiProperty({ example: 'account-id-here' })
  accountId!: string;

  @ApiProperty({ required: false, example: 3, minimum: 1, maximum: 20 })
  dailyTweetTarget?: number;

  @ApiProperty({ required: false, type: [String], example: ['punch', 'spark', 'hook'] })
  formatPreference?: string[];

  @ApiProperty({ required: false, type: [String], example: ['tech', 'ai', 'startup'] })
  topics?: string[];

  @ApiProperty({ required: false, example: 'casual and witty' })
  toneOverride?: string;

  @ApiProperty({ required: false, example: 120, minimum: 15, maximum: 1440 })
  scheduleIntervalMinutes?: number;
}

export class UpdateAgentConfigDto {
  @ApiProperty({ required: false })
  enabled?: boolean;

  @ApiProperty({ required: false, minimum: 1, maximum: 20 })
  dailyTweetTarget?: number;

  @ApiProperty({ required: false, type: [String] })
  formatPreference?: string[];

  @ApiProperty({ required: false, type: [String] })
  topics?: string[];

  @ApiProperty({ required: false, nullable: true })
  toneOverride?: string | null;

  @ApiProperty({ required: false, minimum: 15, maximum: 1440 })
  scheduleIntervalMinutes?: number;
}

export class UpdateStyleProfileDto {
  @ApiProperty({ required: false, example: 'Write about AI and tech startups' })
  customInstructions?: string;

  @ApiProperty({ required: false, example: 'tr' })
  tweetLanguage?: string;
}

export class AnalyzeStyleDto {
  @ApiProperty({ example: 'elonmusk' })
  handle!: string;
}

export class ApproveDraftDto {
  @ApiProperty({ required: false, example: '2026-05-28T10:00:00Z' })
  scheduledAt?: string;
}

export class EditDraftDto {
  @ApiProperty({ example: 'Updated tweet text here' })
  text!: string;
}

export class EditAndApproveDraftDto {
  @ApiProperty({ example: 'Updated tweet text here' })
  text!: string;

  @ApiProperty({ required: false, example: '2026-05-28T10:00:00Z' })
  scheduledAt?: string;
}

export class TriggerAgentDto {
  @ApiProperty({ example: 'uuid-here' })
  configId!: string;
}
