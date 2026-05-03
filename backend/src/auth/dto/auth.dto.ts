import { ApiProperty } from '@nestjs/swagger';

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
