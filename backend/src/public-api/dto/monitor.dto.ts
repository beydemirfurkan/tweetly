import { ApiProperty } from '@nestjs/swagger';

export class MonitorCreateDto {
  @ApiProperty({ example: 'jack', description: 'Handle to monitor (without @)' })
  targetHandle!: string;

  @ApiProperty({ example: 'https://your-host/webhook', description: 'HTTPS URL to POST events to' })
  webhookUrl!: string;

  @ApiProperty({ required: false, description: 'Account to use for polling (defaults to first active)' })
  accountId?: string;

  @ApiProperty({
    required: false,
    type: [String],
    enum: ['tweet.new'],
    isArray: true,
    example: ['tweet.new'],
  })
  eventTypes?: string[];
}
