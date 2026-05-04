import { ApiProperty } from '@nestjs/swagger';

export class AnalyzeProfileDto {
  @ApiProperty({ example: 'elonmusk' })
  handle!: string;

  @ApiProperty({ required: false })
  accountId?: string;
}

export class ContentSuggestDto {
  @ApiProperty({ enum: ['micro', 'punch', 'spark', 'hook', 'storm', 'thunder'] })
  format!: 'micro' | 'punch' | 'spark' | 'hook' | 'storm' | 'thunder';

  @ApiProperty({ required: false })
  topic?: string;

  @ApiProperty({ required: false, type: [String] })
  sourceHandles?: string[];
}

export class ViralScoreDto {
  @ApiProperty()
  text!: string;

  @ApiProperty({ required: false })
  format?: string;

  @ApiProperty({ required: false })
  handle?: string;
}

export class PublishTweetDto {
  @ApiProperty()
  accountId!: string;

  @ApiProperty()
  text!: string;

  @ApiProperty({ required: false })
  scheduledAt?: string;
}
