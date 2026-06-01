# Security Policy

## Reporting a vulnerability

If you've found a security issue in tweetly, please **do not open a public GitHub issue**. Email the maintainer privately:

**furkanbeydemirr@gmail.com**

Include:
- A description of the issue and its impact
- Steps to reproduce (proof-of-concept where possible)
- Affected versions / commits
- Your suggested fix, if any

You'll receive an acknowledgement within 5 business days. Once a fix is ready, we'll coordinate a disclosure timeline with you before publishing.

## Scope

In-scope:
- Authentication / authorization bypass (`tk_*` API keys, admin token, magic links)
- AES-256-GCM credential encryption flaws
- Cross-user data leaks via the action engine, MCP tools, or REST endpoints
- Webhook HMAC verification bypass
- SQL injection, command injection, SSRF in the backend
- XSS / open redirect in the frontend panel

Out-of-scope:
- Self-inflicted damage from users running with `BOOTSTRAP_ADMIN_TOKEN` env still set after first deploy
- Issues caused by running outdated Node / Postgres / Patchright versions
- Reports against the public demo at [xtweetly.com](https://xtweetly.com) that depend on social engineering, brute force, or X's own surfaces
- X account suspensions, rate-limit hits, or Patchright detection — these are inherent to browser automation and not security bugs

## Hardening recommendations for self-hosters

- Rotate `BOOTSTRAP_ADMIN_TOKEN` immediately after first boot
- Set a strong, random 32-byte `ENCRYPTION_KEY` and back it up — losing it makes stored sessions unrecoverable
- Use the **DB-stored** admin token (`PUT /admin/secrets`) for ongoing operator access; never reuse the bootstrap token
- Restrict `CORS_ORIGINS` to your panel domain only
- Run behind a reverse proxy with TLS; the backend doesn't terminate TLS itself
- Treat the `/data/user-data` volume as sensitive — it contains X session profiles
