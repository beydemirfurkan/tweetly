import { assertPublicWebhookUrl, WebhookUrlError } from './webhook-url.guard';

describe('assertPublicWebhookUrl', () => {
  // ── Valid URLs ───────────────────────────────────────────────────────────

  it('allows public HTTPS URLs', async () => {
    await expect(assertPublicWebhookUrl('https://example.com/webhook')).resolves.toBeUndefined();
  });

  it('allows public HTTP URLs', async () => {
    await expect(assertPublicWebhookUrl('http://example.com/webhook')).resolves.toBeUndefined();
  });

  // ── Protocol validation ─────────────────────────────────────────────────

  it('rejects non-http(s) protocols', async () => {
    await expect(assertPublicWebhookUrl('ftp://example.com/hook')).rejects.toThrow(WebhookUrlError);
    await expect(assertPublicWebhookUrl('file:///etc/passwd')).rejects.toThrow(WebhookUrlError);
    await expect(assertPublicWebhookUrl('javascript:alert(1)')).rejects.toThrow(WebhookUrlError);
  });

  it('rejects malformed URLs', async () => {
    await expect(assertPublicWebhookUrl('not a url')).rejects.toThrow(WebhookUrlError);
  });

  // ── Loopback (127.0.0.0/8) ──────────────────────────────────────────────

  it('rejects 127.0.0.1', async () => {
    await expect(assertPublicWebhookUrl('http://127.0.0.1:8080/hook')).rejects.toThrow(
      /private IP/,
    );
  });

  it('rejects 127.0.0.2', async () => {
    await expect(assertPublicWebhookUrl('http://127.0.0.2/hook')).rejects.toThrow(/private IP/);
  });

  // ── Private Class A (10.0.0.0/8) ────────────────────────────────────────

  it('rejects 10.0.0.1', async () => {
    await expect(assertPublicWebhookUrl('http://10.0.0.1/webhook')).rejects.toThrow(/private IP/);
  });

  it('rejects 10.255.255.255', async () => {
    await expect(assertPublicWebhookUrl('http://10.255.255.255/webhook')).rejects.toThrow(/private IP/);
  });

  // ── Private Class B (172.16.0.0/12) ─────────────────────────────────────

  it('rejects 172.16.0.1', async () => {
    await expect(assertPublicWebhookUrl('http://172.16.0.1/webhook')).rejects.toThrow(/private IP/);
  });

  it('rejects 172.31.255.255', async () => {
    await expect(assertPublicWebhookUrl('http://172.31.255.255/webhook')).rejects.toThrow(/private IP/);
  });

  it('does NOT reject 172.32.0.1 (outside 172.16/12 range)', async () => {
    // This resolves to a public IP (dns.lookup for a raw IP returns itself)
    await expect(assertPublicWebhookUrl('http://172.32.0.1/webhook')).resolves.toBeUndefined();
  });

  // ── Private Class C (192.168.0.0/16) ────────────────────────────────────

  it('rejects 192.168.1.1', async () => {
    await expect(assertPublicWebhookUrl('http://192.168.1.1/webhook')).rejects.toThrow(/private IP/);
  });

  // ── Link-local (169.254.0.0/16) ────────────────────────────────────────

  it('rejects 169.254.169.254 (cloud metadata endpoint)', async () => {
    await expect(assertPublicWebhookUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(
      /private IP/,
    );
  });

  // ── IPv6 loopback ───────────────────────────────────────────────────────

  it('rejects [::1]', async () => {
    await expect(assertPublicWebhookUrl('http://[::1]:8080/webhook')).rejects.toThrow(/private IP/);
  });

  // ── Edge cases ──────────────────────────────────────────────────────────

  it('rejects URLs with empty hostname', async () => {
    await expect(assertPublicWebhookUrl('http:///path')).rejects.toThrow();
  });
});
