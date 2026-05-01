import { ApiProperty } from '@nestjs/swagger';

export class AccountUpsertDto {
  @ApiProperty({ required: false, nullable: true, example: 'Alice X' })
  displayName?: string | null;

  @ApiProperty({ required: false, description: 'X session auth_token cookie' })
  authToken?: string;

  @ApiProperty({ required: false, nullable: true, description: 'X auth_multi cookie (multi-account session)' })
  authMulti?: string | null;

  @ApiProperty({ required: false, nullable: true, description: 'X CSRF cookie (ct0)' })
  ct0?: string | null;

  @ApiProperty({ required: false, nullable: true, description: 'X user identifier cookie (twid)' })
  twid?: string | null;

  @ApiProperty({ required: false, enum: ['active', 'paused', 'banned'] })
  status?: 'active' | 'paused' | 'banned';
}

export class SessionHealthDto {
  @ApiProperty({ enum: ['unknown', 'healthy', 'unhealthy'] })
  health!: 'unknown' | 'healthy' | 'unhealthy';

  @ApiProperty({ type: String, nullable: true })
  lastCheckAt!: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastFailureAt!: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastFailureReason!: string | null;

  @ApiProperty({ description: 'Consecutive auth failures since last success' })
  authFailureCount!: number;
}

export class AccountProfileDto {
  @ApiProperty()
  displayName!: string;

  @ApiProperty()
  bio!: string;

  @ApiProperty()
  followersCount!: string;

  @ApiProperty()
  followingCount!: string;

  @ApiProperty()
  tweetsCount!: string;

  @ApiProperty()
  profileImageUrl!: string;

  @ApiProperty()
  verified!: boolean;

  @ApiProperty()
  fetchedAt!: Date;
}

export class RedactedAccountDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  displayName!: string | null;

  @ApiProperty({ enum: ['active', 'paused', 'banned'] })
  status!: 'active' | 'paused' | 'banned';

  @ApiProperty()
  hasAuthToken!: boolean;

  @ApiProperty()
  hasAuthMulti!: boolean;

  @ApiProperty()
  hasCt0!: boolean;

  @ApiProperty()
  hasTwid!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ type: Date, nullable: true })
  lastUsedAt!: Date | null;

  @ApiProperty({ type: SessionHealthDto })
  session!: SessionHealthDto;

  @ApiProperty({ type: AccountProfileDto, nullable: true })
  profile!: AccountProfileDto | null;
}

export class AccountsResponseDto {
  @ApiProperty()
  count!: number;

  @ApiProperty({ type: [RedactedAccountDto] })
  accounts!: RedactedAccountDto[];
}
