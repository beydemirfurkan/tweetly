import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { createTransport, type Transporter } from 'nodemailer';
import { MagicLinkEntity } from '@persistence/entities/magic-link.entity';
import { SettingsService } from '@/settings/settings.service';

const LINK_TTL_MIN = 15;
const DEFAULT_FROM = 'tweetly <noreply@example.com>';
const MAGIC_LINK_CONSOLE_ENVS = new Set(['development', 'test', 'local']);

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
    // Single atomic CAS: only the first concurrent caller for a given token
    // observes a row in the RETURNING set. A second parallel consume() with
    // the same token sees zero rows and gets null — no parallel session can
    // be minted from one observation of the token.
    const result = (await this.repo
      .createQueryBuilder()
      .update()
      .set({ consumedAt: () => 'now()' })
      .where('token_hash = :tokenHash AND consumed_at IS NULL AND expires_at > now()', { tokenHash })
      .returning(['user_id'])
      .execute()) as { raw: Array<{ user_id: string }> };
    const row = result.raw[0];
    return row ? row.user_id : null;
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
          subject: 'Sign in to xtweetly',
          text:
            `Sign in to xtweetly\n\n` +
            `Open this link to finish signing in (expires in ${LINK_TTL_MIN} minutes):\n\n` +
            `  ${link}\n\n` +
            `If you did not request this, you can safely ignore this email.\n\n` +
            `— xtweetly`,
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

    if (canLogMagicLinkToConsole()) {
      this.log.log(`[MAGIC_LINK] ${email} → ${link}`);
      return;
    }

    this.log.warn(
      `Magic-link console fallback disabled in NODE_ENV=${process.env.NODE_ENV ?? 'production'}; ` +
        'configure SMTP delivery to issue sign-in links.',
    );
    throw new ServiceUnavailableException('Magic-link delivery is not configured');
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

function canLogMagicLinkToConsole(env = process.env.NODE_ENV): boolean {
  return !env || MAGIC_LINK_CONSOLE_ENVS.has(env.toLowerCase());
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

// Brand palette (light email):
//   bg #ffffff, card #f8fafc, text #0f172a, muted #64748b,
//   border #e5e7eb, accent #1d9bf0 (X blue, matches the panel `--primary`).
// All styles inline — Gmail/Outlook strip <style> blocks.
function htmlBody(link: string): string {
  // Inline SVG bird = the same lucide icon the app uses, rendered as data URI
  // so it survives image-blocking clients without an extra request.
  const birdSvg =
    "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%2024%2024'%20fill%3D'none'%20stroke%3D'%23ffffff'%20stroke-width%3D'2.5'%20stroke-linecap%3D'round'%20stroke-linejoin%3D'round'%3E%3Cpath%20d%3D'M16%207h.01'%2F%3E%3Cpath%20d%3D'M3.4%2018H12a8%208%200%200%200%208-8V7a4%204%200%200%200-7.28-2.3L2%2020'%2F%3E%3Cpath%20d%3D'm20%207%202%200'%2F%3E%3Cpath%20d%3D'M9.5%2014.4%206%2017.5'%2F%3E%3C%2Fsvg%3E";

  return [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">',
    '<title>Sign in to xtweetly</title></head>',
    '<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,\'Helvetica Neue\',Arial,sans-serif;color:#0f172a;-webkit-font-smoothing:antialiased">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px">',
    '<tr><td align="center">',
    '<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden">',

    // Brand header
    '<tr><td style="padding:28px 32px 0">',
    '<table role="presentation" cellpadding="0" cellspacing="0">',
    '<tr>',
    `<td valign="middle" style="background:#0f172a;border-radius:9999px;width:32px;height:32px;text-align:center"><img src="${birdSvg}" width="18" height="18" alt="" style="display:block;margin:7px auto"></td>`,
    '<td valign="middle" style="padding-left:10px;font-weight:800;font-size:18px;letter-spacing:-0.01em;color:#0f172a">xtweetly</td>',
    '</tr></table>',
    '</td></tr>',

    // Eyebrow
    '<tr><td style="padding:28px 32px 0">',
    '<div style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#64748b">',
    '<span style="color:#1d9bf0">●</span>&nbsp; Sign-in link',
    '</div>',
    '</td></tr>',

    // Headline
    '<tr><td style="padding:8px 32px 0">',
    '<h1 style="margin:0;font-size:28px;line-height:1.15;letter-spacing:-0.02em;font-weight:800;color:#0f172a">Sign in to <span style="color:#1d9bf0">xtweetly</span></h1>',
    '</td></tr>',

    // Body copy
    '<tr><td style="padding:14px 32px 0">',
    `<p style="margin:0;font-size:15px;line-height:1.55;color:#334155">Click the button below to finish signing in. The link expires in <strong style="color:#0f172a">${LINK_TTL_MIN} minutes</strong> and works only once.</p>`,
    '</td></tr>',

    // CTA button (bulletproof: table-based for Outlook)
    '<tr><td style="padding:24px 32px 0">',
    '<table role="presentation" cellpadding="0" cellspacing="0">',
    '<tr><td align="center" style="background:#1d9bf0;border-radius:9999px">',
    `<a href="${link}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:-0.005em">Sign in →</a>`,
    '</td></tr></table>',
    '</td></tr>',

    // Fallback URL block
    '<tr><td style="padding:24px 32px 0">',
    '<div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:1.55;color:#334155;word-break:break-all">',
    `<div style="color:#64748b;margin-bottom:6px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase">Or paste this URL</div>`,
    `<a href="${link}" style="color:#1d9bf0;text-decoration:none">${link}</a>`,
    '</div>',
    '</td></tr>',

    // Hairline divider + disclaimer
    '<tr><td style="padding:28px 32px">',
    '<div style="border-top:1px solid #e5e7eb;padding-top:18px;font-size:12px;line-height:1.55;color:#64748b">',
    'If you did not request this, you can safely ignore this email — your account stays untouched.',
    '</div>',
    '</td></tr>',

    '</table>',

    // Footer
    '<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;margin-top:16px">',
    '<tr><td align="center" style="padding:0 32px;font-size:12px;color:#94a3b8;letter-spacing:0.02em">',
    '© 2026 xtweetly &nbsp;·&nbsp; not affiliated with X Corp.',
    '</td></tr>',
    '</table>',

    '</td></tr></table></body></html>',
  ].join('');
}
