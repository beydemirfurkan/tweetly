import { ApiProperty } from '@nestjs/swagger';

export class RequestLinkDto {
  @ApiProperty({ example: 'you@example.com', description: 'Account email address' })
  email!: string;
}

export class ConsumeLinkDto {
  @ApiProperty({
    example: 'a3e4f385cc761137690bb42f4c0e34e9f6eaad9c082037ea172d190cb8fbc718',
    description: 'Magic-link token sent to the user email',
  })
  token!: string;
}

export class CreateApiKeyDto {
  @ApiProperty({ example: 'Claude Code', description: 'Human-readable label for the key' })
  name!: string;

  @ApiProperty({
    required: false,
    type: [String],
    example: ['*'],
    description: 'Reserved for future scope enforcement (default: ["*"])',
  })
  scopes?: string[];
}

export class ConsumeResponseDto {
  @ApiProperty()
  ok!: boolean;

  @ApiProperty({ example: 'tk_xxx...', description: 'Session API key — store and use as Bearer token' })
  sessionKey!: string;

  @ApiProperty({
    example: { id: 'a8765905-...', email: 'you@example.com' },
  })
  user!: { id: string; email: string };
}

export class MeDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'you@example.com' })
  email!: string;

  @ApiProperty({ enum: ['active', 'suspended'] })
  status!: 'active' | 'suspended';
}

export class ApiKeySummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ example: 'tk_0e97c65e' })
  prefix!: string;

  @ApiProperty({ type: [String] })
  scopes!: string[];

  @ApiProperty({ type: String, nullable: true })
  lastUsedAt!: string | null;

  @ApiProperty({ type: String, nullable: true })
  expiresAt!: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty({ type: String, nullable: true })
  revokedAt!: string | null;
}

export class CreatedApiKeyDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'tk_xxx...', description: 'Plain key — shown only once. Store securely.' })
  key!: string;

  @ApiProperty()
  prefix!: string;

  @ApiProperty()
  name!: string;
}
