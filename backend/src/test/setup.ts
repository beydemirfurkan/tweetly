process.env.X_EXECUTOR_MODE = 'noop';
process.env.MONITOR_POLLING_ENABLED = 'false';
process.env.ADMIN_TOKEN = 'test-token';
// Deterministic 32-byte key for unit tests (base64). Production must override.
process.env.ENCRYPTION_KEY = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=';
