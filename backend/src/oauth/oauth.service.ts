import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { OAuthClientEntity } from '@persistence/entities/oauth-client.entity';
import { OAuthCodeStore, type AuthCodeRecord } from './oauth-code-store.service';
import { OAuthCredentialHasher } from './credential-hasher.service';
import { PkceVerifier } from './pkce-verifier.service';

export interface RegisteredClient {
  clientId: string;
  clientSecret: string; // plaintext — only returned once at registration
  clientName: string;
  redirectUris: string[];
}

@Injectable()
export class OAuthService {
  private readonly log = new Logger(OAuthService.name);

  constructor(
    @InjectRepository(OAuthClientEntity)
    private readonly clients: Repository<OAuthClientEntity>,
    private readonly codes: OAuthCodeStore,
    private readonly hasher: OAuthCredentialHasher,
    private readonly pkce: PkceVerifier,
  ) {}

  // ── DCR (RFC 7591) ────────────────────────────────────────────────────────

  async registerClient(input: {
    clientName: string;
    redirectUris: string[];
  }): Promise<RegisteredClient> {
    const cleaned = input.redirectUris.map((u) => u.trim()).filter(Boolean);
    if (cleaned.length === 0) {
      throw new BadRequestException({
        error: 'invalid_redirect_uri',
        error_description: 'redirect_uris must contain at least one URI',
      });
    }
    for (const uri of cleaned) {
      try {
        const parsed = new URL(uri);
        // Per RFC 8252 §7.3 + MCP guidance: allow https, http (Claude Desktop
        // uses http://localhost callbacks), and custom schemes for native apps.
        if (!parsed.protocol) throw new Error('bad protocol');
      } catch {
        throw new BadRequestException({
          error: 'invalid_redirect_uri',
          error_description: `redirect_uri is not a valid URI: ${uri}`,
        });
      }
    }

    const clientId = `oauth_${crypto.randomBytes(16).toString('hex')}`;
    const clientSecret = crypto.randomBytes(32).toString('hex');
    const clientSecretHash = this.hasher.hash(clientSecret);

    const saved = await this.clients.save(
      this.clients.create({
        clientId,
        clientSecretHash,
        clientName: input.clientName.slice(0, 200),
        redirectUris: cleaned,
      }),
    );

    this.log.log(`Registered OAuth client ${saved.clientId} (${saved.clientName})`);
    return {
      clientId: saved.clientId,
      clientSecret,
      clientName: saved.clientName,
      redirectUris: saved.redirectUris,
    };
  }

  async findClient(clientId: string): Promise<OAuthClientEntity | null> {
    return this.clients.findOne({ where: { clientId } });
  }

  async verifyClientSecret(clientId: string, clientSecret: string): Promise<OAuthClientEntity | null> {
    const client = await this.findClient(clientId);
    if (!client) return null;
    return this.hasher.verify(clientSecret, client.clientSecretHash) ? client : null;
  }

  // ── Authorization codes ───────────────────────────────────────────────────

  async issueAuthCode(input: AuthCodeRecord): Promise<string> {
    const code = crypto.randomBytes(32).toString('hex');
    await this.codes.put(code, input);
    return code;
  }

  async consumeAuthCode(code: string): Promise<AuthCodeRecord | null> {
    return this.codes.consume(code);
  }

  // ── PKCE (S256 only) ──────────────────────────────────────────────────────

  verifyPkce(verifier: string, challenge: string): boolean {
    return this.pkce.verifyS256(verifier, challenge);
  }

  // ── Validation helpers ────────────────────────────────────────────────────

  assertRedirectUriRegistered(client: OAuthClientEntity, redirectUri: string): void {
    if (!client.redirectUris.includes(redirectUri)) {
      throw new BadRequestException({
        error: 'invalid_redirect_uri',
        error_description: 'redirect_uri does not match a registered URI for this client',
      });
    }
  }

  async requireClient(clientId: string): Promise<OAuthClientEntity> {
    const client = await this.findClient(clientId);
    if (!client) {
      throw new NotFoundException({
        error: 'invalid_client',
        error_description: `Unknown client_id: ${clientId}`,
      });
    }
    return client;
  }
}
