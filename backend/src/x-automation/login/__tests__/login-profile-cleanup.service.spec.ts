import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('LoginProfileCleanupService.sweep', () => {
  let tmpRoot: string;
  let originalDataDir: string | undefined;

  beforeEach(async () => {
    originalDataDir = process.env.DATA_DIR;
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'login-cleanup-spec-'));
    process.env.DATA_DIR = tmpRoot;
    // 1-day retention so we can age files past with utimes in tests.
    process.env.LOGIN_PROFILE_RETENTION_DAYS = '1';
  });

  afterEach(async () => {
    delete process.env.LOGIN_PROFILE_RETENTION_DAYS;
    delete process.env.LOGIN_PROFILE_CLEANUP_DISABLED;
    if (originalDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = originalDataDir;
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  async function makeProfileDir(name: string, ageDays: number): Promise<string> {
    const dir = path.join(tmpRoot, 'user-data', name);
    await fs.mkdir(dir, { recursive: true });
    // Drop a file so the dir has real content (mimics Chrome's Cache, etc).
    await fs.writeFile(path.join(dir, 'data.bin'), 'x');
    const past = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000);
    await fs.utimes(dir, past, past);
    return dir;
  }

  async function makeArtifact(name: string, ageDays: number): Promise<string> {
    const dir = path.join(tmpRoot, 'errors', 'login');
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, name);
    await fs.writeFile(file, '{}');
    const past = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000);
    await fs.utimes(file, past, past);
    return file;
  }

  it('removes login-* profile dirs older than the retention window', async () => {
    // We need to import the service AFTER setting DATA_DIR so its
    // module-level constants pick up our tmp root. Module cache is
    // sticky between test files; require it lazily via dynamic import
    // here, but since the constants are resolved at module load they
    // capture the env at *first* import only. Instead, the service
    // resolves env on each call → no, look again at the impl.
    // The impl reads `DATA_DIR` at module load. To keep this test
    // hermetic we re-require the module after env mutation by clearing
    // the cache.
    jest.resetModules();
    const { LoginProfileCleanupService: Svc } = await import('./login-profile-cleanup.service');

    const oldDir = await makeProfileDir('login-alice-us', 30);
    const freshDir = await makeProfileDir('login-bob-us', 0);

    const svc = new Svc();
    const result = await svc.sweep();

    expect(result.profiles).toBe(1);
    await expect(fs.access(oldDir)).rejects.toBeDefined();
    await expect(fs.access(freshDir)).resolves.toBeUndefined();
  });

  it('leaves account-keyed (non-login-*) profile dirs alone even when very old', async () => {
    jest.resetModules();
    const { LoginProfileCleanupService: Svc } = await import('./login-profile-cleanup.service');

    const reauthDir = await makeProfileDir('alice', 365);
    const svc = new Svc();
    const result = await svc.sweep();

    expect(result.profiles).toBe(0);
    await expect(fs.access(reauthDir)).resolves.toBeUndefined();
  });

  it('removes debug artifacts older than the retention window', async () => {
    jest.resetModules();
    const { LoginProfileCleanupService: Svc } = await import('./login-profile-cleanup.service');

    const oldArtifact = await makeArtifact('2025-10-01-old.json', 30);
    const freshArtifact = await makeArtifact('2026-05-25-fresh.json', 0);

    const svc = new Svc();
    const result = await svc.sweep();

    expect(result.artifacts).toBe(1);
    await expect(fs.access(oldArtifact)).rejects.toBeDefined();
    await expect(fs.access(freshArtifact)).resolves.toBeUndefined();
  });

  it('returns {0,0} cleanly when the data dir does not exist (fresh install)', async () => {
    jest.resetModules();
    const { LoginProfileCleanupService: Svc } = await import('./login-profile-cleanup.service');

    const svc = new Svc();
    const result = await svc.sweep();
    expect(result).toEqual({ profiles: 0, artifacts: 0 });
  });
});
