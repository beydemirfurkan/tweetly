import { redactLoginDebugText } from './login-debug-artifact';

describe('redactLoginDebugText', () => {
  it('redacts known credentials and token-like values', () => {
    const text = 'user=testuser email=a@example.com password=Secret123 auth_token=abc ct0=def Bearer xyz 123456';

    const redacted = redactLoginDebugText(text, ['testuser', 'a@example.com', 'Secret123']);

    expect(redacted).not.toContain('testuser');
    expect(redacted).not.toContain('a@example.com');
    expect(redacted).not.toContain('Secret123');
    expect(redacted).not.toContain('auth_token=abc');
    expect(redacted).not.toContain('ct0=def');
    expect(redacted).not.toContain('Bearer xyz');
    expect(redacted).not.toContain('123456');
    expect(redacted).toContain('[redacted]');
  });

  it('does not redact short incidental values', () => {
    const redacted = redactLoginDebugText('go to x', ['x']);

    expect(redacted).toBe('go to x');
  });
});
