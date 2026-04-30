import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { createTransport, type Transporter } from 'nodemailer';
import { MagicLinkEntity } from '../persistence/entities/magic-link.entity';

const LINK_TTL_MIN = 15;
const DEFAULT_FROM = 'Tweetly <noreply@tweetly.local>';

type MailProvider = 'console' | 'smtp';

@Injectable()
export class MagicLinkService implements OnModuleInit {
  private readonly log = new Logger(MagicLinkService.name);
  private transporter: Transporter | null = null;
  private provider: MailProvider = 'console';

  constructor(
    @InjectRepository(MagicLinkEntity)
    private readonly repo: Repository<MagicLinkEntity>,
  ) {}

  onModuleInit(): void {
    const raw = (process.env.MAIL_PROVIDER ?? 'console').toLowerCase();
    if (raw === 'smtp') {
      const host = process.env.SMTP_HOST;
      if (!host) {
        this.log.warn('MAIL_PROVIDER=smtp but SMTP_HOST not set; falling back to console');
        return;
      }
      const port = parseInt(process.env.SMTP_PORT ?? '587', 10);
      const user = process.env.SMTP_USER;
      const pass = process.env.SMTP_PASS;
      const secure = (process.env.SMTP_SECURE ?? '').toLowerCase() === 'true' || port === 465;

      this.transporter = createTransport({
        host,
        port,
        secure,
        auth: user && pass ? { user, pass } : undefined,
      });
      this.provider = 'smtp';
      this.log.log(`SMTP transport configured: ${host}:${port} (secure=${secure})`);
    }
  }

  async issue(userId: string, email: string): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('hex');
    const tokenHash = sha256(token);
    const expiresAt = new Date(Date.now() + LINK_TTL_MIN * 60 * 1000);

    await this.repo.insert({ userId, tokenHash, expiresAt });
    await this.deliver(email, token);
    return { token, expiresAt };
  }

  async consume(token: string): Promise<string | null> {
    if (!token) return null;
    const tokenHash = sha256(token);
    const row = await this.repo.findOne({ where: { tokenHash, consumedAt: IsNull() } });
    if (!row) return null;
    if (row.expiresAt.getTime() < Date.now()) return null;

    await this.repo.update(row.id, { consumedAt: new Date() });
    return row.userId;
  }

  private async deliver(email: string, token: string): Promise<void> {
    const baseUrl = process.env.APP_URL ?? 'http://localhost:3000';
    const link = `${baseUrl}/auth/verify?token=${token}`;

    if (this.provider === 'smtp' && this.transporter) {
      const from = process.env.MAIL_FROM ?? DEFAULT_FROM;
      try {
        await this.transporter.sendMail({
          from,
          to: email,
          subject: 'Tweetly login link',
          text:
            `Sign in to Tweetly:\n\n${link}\n\n` +
            `This link expires in ${LINK_TTL_MIN} minutes. If you did not request it, ignore this email.`,
          html: htmlBody(link),
        });
        this.log.log(`Magic link sent to ${email} via SMTP`);
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log.error(`SMTP delivery failed for ${email}: ${msg}`);
        // Fall through to console so we never silently drop the link in dev.
      }
    }

    this.log.log(`[MAGIC_LINK] ${email} → ${link}`);
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function htmlBody(link: string): string {
  return [
    '<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">',
    '<h2 style="margin:0 0 12px">Sign in to Tweetly</h2>',
    `<p>Click the button below to finish signing in. This link expires in ${LINK_TTL_MIN} minutes.</p>`,
    `<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#0e1117;color:#fff;border-radius:6px;text-decoration:none">Sign in</a></p>`,
    `<p style="font-size:12px;color:#666">Or paste this URL into your browser:<br><span style="word-break:break-all">${link}</span></p>`,
    '<p style="font-size:12px;color:#666">If you did not request this, you can safely ignore the email.</p>',
    '</div>',
  ].join('');
}
