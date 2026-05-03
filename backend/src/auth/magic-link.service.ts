import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { createTransport, type Transporter } from 'nodemailer';
import { MagicLinkEntity } from '@persistence/entities/magic-link.entity';
import { SettingsService } from '@/settings/settings.service';

const LINK_TTL_MIN = 15;
const DEFAULT_FROM = 'Tweetly <noreply@tweetly.local>';

interface SmtpConfig {
  host: string;
  port: number;
  user: string | null;
  pass: string | null;
  secure: boolean;
  from: string;
}

@Injectable()
export class MagicLinkService {
  private readonly log = new Logger(MagicLinkService.name);
  private transporter: Transporter | null = null;
  private cachedConfig: SmtpConfig | null = null;

  constructor(
    @InjectRepository(MagicLinkEntity)
    private readonly repo: Repository<MagicLinkEntity>,
    private readonly settings: SettingsService,
  ) {}

  /** Called from AdminApiController.updateSecrets after a config write. */
  invalidateTransport(): void {
    this.transporter = null;
    this.cachedConfig = null;
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

    const transporter = await this.resolveTransporter();
    if (transporter && this.cachedConfig) {
      try {
        await transporter.sendMail({
          from: this.cachedConfig.from,
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

  private async resolveTransporter(): Promise<Transporter | null> {
    if (this.transporter) return this.transporter;

    const provider = (await this.settings.get<string>('secrets.mail_provider', 'console')).toLowerCase();
    if (provider !== 'smtp') return null;

    const host = await this.settings.get<string>('secrets.smtp_host', '');
    if (!host) {
      this.log.warn('secrets.mail_provider=smtp but secrets.smtp_host not set; using console fallback');
      return null;
    }
    const portRaw = await this.settings.get<number | string>('secrets.smtp_port', 587);
    const port = parseInt(String(portRaw), 10) || 587;
    const user = (await this.settings.get<string>('secrets.smtp_user', '')) || null;
    const pass = (await this.settings.get<string>('secrets.smtp_pass', '')) || null;
    const secureFlag = await this.settings.get<boolean | string>('secrets.smtp_secure', false);
    const secure = String(secureFlag).toLowerCase() === 'true' || port === 465;
    const from = (await this.settings.get<string>('secrets.mail_from', '')) || DEFAULT_FROM;

    this.cachedConfig = { host, port, user, pass, secure, from };
    this.transporter = createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
    });
    this.log.log(`SMTP transport configured from DB: ${host}:${port} (secure=${secure})`);
    return this.transporter;
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
