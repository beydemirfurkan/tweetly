import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Logger,
  NotFoundException,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiKeyGuard, getAuthContext } from '@/auth/api-key.guard';
import { ApiKeyService } from '@/auth/api-key.service';
import {
  TieredThrottlerGuard,
  RateLimitOAuthRegister,
  RateLimitWrite,
} from '@/auth/tiered-throttler.guard';
import { OAuthService } from './oauth.service';

interface RegisterBody {
  client_name?: unknown;
  redirect_uris?: unknown;
}

interface AuthorizeConfirmBody {
  client_id?: unknown;
  redirect_uri?: unknown;
  code_challenge?: unknown;
  code_challenge_method?: unknown;
  state?: unknown;
  scope?: unknown;
  decision?: unknown;
}

interface TokenBody {
  grant_type?: unknown;
  code?: unknown;
  code_verifier?: unknown;
  client_id?: unknown;
  client_secret?: unknown;
  redirect_uri?: unknown;
}

interface RevokeBody {
  token?: unknown;
  client_id?: unknown;
  client_secret?: unknown;
}

@Controller('oauth')
export class OAuthController {
  private readonly log = new Logger(OAuthController.name);

  constructor(
    private readonly oauth: OAuthService,
    private readonly apiKeys: ApiKeyService,
  ) {}

  // RFC 7591 — Dynamic Client Registration. Public endpoint, IP-rate-limited.
  @Post('register')
  @UseGuards(TieredThrottlerGuard)
  @RateLimitOAuthRegister()
  async register(@Body() body: RegisterBody) {
    const clientName = typeof body.client_name === 'string' && body.client_name.trim()
      ? body.client_name.trim()
      : 'Unnamed MCP Client';
    if (!Array.isArray(body.redirect_uris) || body.redirect_uris.length === 0) {
      throw new BadRequestException({
        error: 'invalid_redirect_uri',
        error_description: 'redirect_uris is required and must be a non-empty array',
      });
    }
    const redirectUris = body.redirect_uris.filter(
      (u): u is string => typeof u === 'string',
    );
    const client = await this.oauth.registerClient({ clientName, redirectUris });
    return {
      client_id: client.clientId,
      client_secret: client.clientSecret,
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: 'client_secret_post',
      grant_types: ['authorization_code'],
      response_types: ['code'],
    };
  }

  // Public lookup so the consent page can render the client name.
  @Get('clients/:clientId')
  async getClient(@Param('clientId') clientId: string) {
    const client = await this.oauth.findClient(clientId);
    if (!client) {
      throw new NotFoundException({
        error: 'invalid_client',
        error_description: `Unknown client_id: ${clientId}`,
      });
    }
    return {
      client_id: client.clientId,
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
    };
  }

  // Called by the frontend consent page after the user clicks Allow/Deny.
  // Auth: panel session tk_* (browsers can't send Authorization on the
  // /oauth/authorize redirect, so the consent UI lives on the frontend
  // and proxies the decision through this Bearer-auth'd POST).
  @Post('authorize/confirm')
  @UseGuards(ApiKeyGuard, TieredThrottlerGuard)
  @RateLimitWrite()
  async authorizeConfirm(@Req() req: Request, @Body() body: AuthorizeConfirmBody) {
    const ctx = getAuthContext(req);

    const clientId = stringField(body.client_id, 'client_id');
    const redirectUri = stringField(body.redirect_uri, 'redirect_uri');
    const state = typeof body.state === 'string' ? body.state : '';
    const decision = body.decision === 'allow' ? 'allow' : 'deny';

    const client = await this.oauth.requireClient(clientId);
    this.oauth.assertRedirectUriRegistered(client, redirectUri);

    if (decision === 'deny') {
      this.log.log(
        `authorize denied user=${ctx.userId} client=${client.clientId} (${client.clientName})`,
      );
      return { redirect_to: appendQuery(redirectUri, { error: 'access_denied', state }) };
    }

    const codeChallenge = stringField(body.code_challenge, 'code_challenge');
    const codeChallengeMethod = stringField(body.code_challenge_method, 'code_challenge_method');
    if (codeChallengeMethod !== 'S256') {
      throw new BadRequestException({
        error: 'invalid_request',
        error_description: 'Only S256 code_challenge_method is supported',
      });
    }
    const scope = typeof body.scope === 'string' ? body.scope : '*';

    const code = await this.oauth.issueAuthCode({
      userId: ctx.userId,
      clientId: client.clientId,
      redirectUri,
      codeChallenge,
      scope,
    });

    this.log.log(
      `authorize allowed user=${ctx.userId} client=${client.clientId} (${client.clientName})`,
    );
    return { redirect_to: appendQuery(redirectUri, { code, state }) };
  }

  // RFC 6749 §4.1.3 — authorization_code grant. Accepts both
  // application/x-www-form-urlencoded and application/json bodies; client
  // credentials may arrive via Basic auth (client_secret_basic) or in body
  // (client_secret_post).
  @Post('token')
  @UseGuards(TieredThrottlerGuard)
  @RateLimitWrite()
  async token(
    @Body() body: TokenBody,
    @Headers('authorization') authHeader: string | undefined,
  ) {
    if (body.grant_type !== 'authorization_code') {
      throw new BadRequestException({
        error: 'unsupported_grant_type',
        error_description: 'Only authorization_code is supported',
      });
    }

    const basic = parseBasicAuth(authHeader);
    const clientId = basic?.id ?? (typeof body.client_id === 'string' ? body.client_id : '');
    const clientSecret = basic?.secret
      ?? (typeof body.client_secret === 'string' ? body.client_secret : '');
    if (!clientId || !clientSecret) {
      throw new UnauthorizedException({
        error: 'invalid_client',
        error_description: 'client_id and client_secret are required',
      });
    }
    const client = await this.oauth.verifyClientSecret(clientId, clientSecret);
    if (!client) {
      throw new UnauthorizedException({
        error: 'invalid_client',
        error_description: 'client authentication failed',
      });
    }

    const code = typeof body.code === 'string' ? body.code : '';
    const verifier = typeof body.code_verifier === 'string' ? body.code_verifier : '';
    const redirectUri = typeof body.redirect_uri === 'string' ? body.redirect_uri : '';
    if (!code || !verifier || !redirectUri) {
      throw new BadRequestException({
        error: 'invalid_request',
        error_description: 'code, code_verifier, and redirect_uri are required',
      });
    }

    const record = await this.oauth.consumeAuthCode(code);
    if (!record) {
      throw new BadRequestException({
        error: 'invalid_grant',
        error_description: 'authorization code is invalid, expired, or already used',
      });
    }
    if (record.clientId !== client.clientId) {
      throw new BadRequestException({
        error: 'invalid_grant',
        error_description: 'authorization code was issued to a different client',
      });
    }
    if (record.redirectUri !== redirectUri) {
      throw new BadRequestException({
        error: 'invalid_grant',
        error_description: 'redirect_uri does not match the original authorization request',
      });
    }
    if (!this.oauth.verifyPkce(verifier, record.codeChallenge)) {
      throw new BadRequestException({
        error: 'invalid_grant',
        error_description: 'PKCE verification failed',
      });
    }

    const issued = await this.apiKeys.issueOAuthKey({
      userId: record.userId,
      oauthClientId: client.clientId,
      clientName: client.clientName,
    });

    this.log.log(
      `token issued user=${record.userId} client=${client.clientId} key=${issued.prefix}`,
    );
    return {
      access_token: issued.plainKey,
      token_type: 'Bearer',
      scope: '*',
    };
  }

  // RFC 7009 — token revocation. Client must authenticate; only their own
  // tokens are revocable. Always returns 200 per spec, even for unknown tokens.
  @Post('revoke')
  @UseGuards(TieredThrottlerGuard)
  @RateLimitWrite()
  async revoke(
    @Body() body: RevokeBody,
    @Headers('authorization') authHeader: string | undefined,
  ) {
    const basic = parseBasicAuth(authHeader);
    const clientId = basic?.id ?? (typeof body.client_id === 'string' ? body.client_id : '');
    const clientSecret = basic?.secret
      ?? (typeof body.client_secret === 'string' ? body.client_secret : '');
    if (!clientId || !clientSecret) {
      throw new UnauthorizedException({
        error: 'invalid_client',
        error_description: 'client_id and client_secret are required',
      });
    }
    const client = await this.oauth.verifyClientSecret(clientId, clientSecret);
    if (!client) {
      throw new UnauthorizedException({
        error: 'invalid_client',
      });
    }
    const token = typeof body.token === 'string' ? body.token : '';
    if (token) await this.apiKeys.revokeByPlainKey(token);
    return { ok: true };
  }
}

function stringField(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException({
      error: 'invalid_request',
      error_description: `${name} is required`,
    });
  }
  return value;
}

function appendQuery(uri: string, params: Record<string, string>): string {
  const url = new URL(uri);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }
  return url.toString();
}

function parseBasicAuth(header: string | undefined): { id: string; secret: string } | null {
  if (!header || !header.toLowerCase().startsWith('basic ')) return null;
  try {
    const decoded = Buffer.from(header.slice(6).trim(), 'base64').toString('utf8');
    const idx = decoded.indexOf(':');
    if (idx < 0) return null;
    return {
      id: decodeURIComponent(decoded.slice(0, idx)),
      secret: decodeURIComponent(decoded.slice(idx + 1)),
    };
  } catch {
    return null;
  }
}
