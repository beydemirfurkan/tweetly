import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createClerkClient, verifyToken, type ClerkClient } from '@clerk/backend';

export interface ClerkAuthInfo {
  clerkUserId: string;
  email: string | null;
}

@Injectable()
export class ClerkTokenService implements OnModuleInit {
  private readonly log = new Logger(ClerkTokenService.name);
  private client: ClerkClient | null = null;
  private readonly secretKey = process.env.CLERK_SECRET_KEY ?? '';
  private readonly publishableKey = process.env.CLERK_PUBLISHABLE_KEY ?? '';
  private readonly jwtKey = process.env.CLERK_JWT_KEY ?? '';
  private readonly authorizedParties = (process.env.CLERK_AUTHORIZED_PARTIES ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  onModuleInit(): void {
    if (!this.secretKey) {
      this.log.warn('CLERK_SECRET_KEY missing — Clerk JWT auth will reject all tokens');
      return;
    }
    this.client = createClerkClient({
      secretKey: this.secretKey,
      publishableKey: this.publishableKey || undefined,
    });
  }

  isConfigured(): boolean {
    return Boolean(this.secretKey);
  }

  /** Verifies a Clerk session JWT. Returns clerkUserId + email (fetched on demand) or null. */
  async verifySessionToken(token: string): Promise<ClerkAuthInfo | null> {
    if (!this.secretKey) return null;
    try {
      const payload = await verifyToken(token, {
        secretKey: this.secretKey,
        jwtKey: this.jwtKey || undefined,
        authorizedParties: this.authorizedParties.length ? this.authorizedParties : undefined,
      });
      const sub = typeof payload.sub === 'string' ? payload.sub : null;
      if (!sub) return null;
      const email = await this.fetchPrimaryEmail(sub);
      return { clerkUserId: sub, email };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.debug(`Clerk JWT verification failed: ${msg}`);
      return null;
    }
  }

  /** Fetches the primary verified email for a Clerk user via Backend API. */
  async fetchPrimaryEmail(clerkUserId: string): Promise<string | null> {
    if (!this.client) return null;
    try {
      const user = await this.client.users.getUser(clerkUserId);
      const primaryId = user.primaryEmailAddressId;
      const primary = user.emailAddresses?.find((e) => e.id === primaryId) ?? user.emailAddresses?.[0];
      return primary?.emailAddress ?? null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.warn(`Clerk users.getUser(${clerkUserId}) failed: ${msg}`);
      return null;
    }
  }
}
