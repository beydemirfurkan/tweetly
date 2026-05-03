// Process-level env defaults for integration tests. Mirrors src/test/setup.ts
// for unit tests but skips the parts that are unit-test specific.
process.env.X_EXECUTOR_MODE = 'noop';
process.env.MONITOR_POLLING_ENABLED = 'false';
process.env.WORKER_DISABLED = 'true';
process.env.ADMIN_TOKEN = 'test-token';
process.env.ENCRYPTION_KEY = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=';
