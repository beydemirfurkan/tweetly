import { ApiProperty } from '@nestjs/swagger';

export class AccountConnectDto {
  @ApiProperty({ description: 'X handle. Leading @ is stripped automatically.', example: 'alice' })
  username!: string;

  @ApiProperty({ description: 'Email tied to the X account (required by login flow).' })
  email!: string;

  @ApiProperty({ description: 'X account password. Encrypted at rest immediately.' })
  password!: string;

  @ApiProperty({
    required: false,
    nullable: true,
    description:
      'Base32 TOTP secret (NOT the 6-digit code). Find it in X → Settings → ' +
      "Security → 2FA → Authenticator app → 'Can't scan QR?'. Required for 2FA-enabled accounts.",
  })
  totpSecret?: string | null;

  @ApiProperty({
    required: false,
    default: false,
    description:
      'When true, the encrypted TOTP secret is retained on the account so re-auth ' +
      'can run without re-prompting. When false, the secret is wiped after the login job completes.',
  })
  saveTotpSecret?: boolean;

  @ApiProperty({
    required: false,
    nullable: true,
    description:
      'Two-letter country code (ISO 3166-1 alpha-2) hinting which proxy region to log in from. ' +
      'Requires LOGIN_PROXY_<CC> env to be configured server-side; otherwise ignored.',
    example: 'TR',
  })
  proxyCountry?: string | null;
}

export class AccountReauthDto {
  @ApiProperty({ description: 'Current X account password.' })
  password!: string;

  @ApiProperty({
    required: false,
    nullable: true,
    description: 'Base32 TOTP secret. Required if 2FA is enabled and not stored on the account.',
  })
  totpSecret?: string | null;

  @ApiProperty({ required: false, default: false })
  saveTotpSecret?: boolean;

  @ApiProperty({ required: false, nullable: true, description: 'Update the stored email during reauth.' })
  email?: string | null;

  @ApiProperty({ required: false, nullable: true, example: 'TR' })
  proxyCountry?: string | null;
}

export class LoginJobResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ['connect', 'reauth'] })
  kind!: 'connect' | 'reauth';

  @ApiProperty({ enum: ['queued', 'running', 'success', 'failed'] })
  status!: 'queued' | 'running' | 'success' | 'failed';

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Set once the login completes (handle of the connected account).',
  })
  targetAccountId!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    enum: ['invalid_credentials', 'captcha_required', 'email_challenge', 'login_cooldown', 'unknown'],
  })
  failureReason!: string | null;

  @ApiProperty({ type: String, nullable: true })
  failureDetail!: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty({ type: String, nullable: true })
  startedAt!: string | null;

  @ApiProperty({ type: String, nullable: true })
  finishedAt!: string | null;
}

export class LoginJobAcceptedDto {
  @ApiProperty()
  jobId!: string;

  @ApiProperty({ enum: ['connect', 'reauth'] })
  kind!: 'connect' | 'reauth';

  @ApiProperty({
    description: 'Suggested polling URL for status updates.',
    example: '/api/v1/accounts/login-jobs/<id>',
  })
  pollUrl!: string;
}
