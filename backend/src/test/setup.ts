process.env.X_EXECUTOR_MODE = 'noop';
process.env.MONITOR_POLLING_ENABLED = 'false';
process.env.ADMIN_TOKEN = 'test-token';
// Deterministic 32-byte key for unit tests (base64). Production must override.
process.env.ENCRYPTION_KEY = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=';
// Allowlist the placeholder hostnames used in existing monitor specs so the
// SSRF validator passes them without a real DNS lookup. Specs that test the
// validator itself reset/override this in their own beforeEach.
process.env.WEBHOOK_HOST_ALLOWLIST = 'hook,hooks,example.com,hook.test';
