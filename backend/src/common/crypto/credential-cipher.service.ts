import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { envBackedConfig } from '@/config/process-env-shim';

const VERSION = 'v1';
const ALGO = 'aes-256-gcm';
const KEY_LEN = 32;
const IV_LEN = 12;
const TAG_LEN = 16;
const HKDF_INFO = Buffer.from('tweetly:account-cred:v1', 'utf8');
const HKDF_SALT = Buffer.from('tweetly:cipher:hkdf:v1', 'utf8');

@Injectable()
export class CredentialCipherService {
  private readonly key: Buffer;

  constructor(masterKey: Buffer = loadMasterKeyFromEnv()) {
    this.key = Buffer.from(hkdfSync('sha256', masterKey, HKDF_SALT, HKDF_INFO, KEY_LEN));
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGO, this.key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${VERSION}:${Buffer.concat([iv, tag, ct]).toString('base64')}`;
  }

  decrypt(blob: string): string {
    const colon = blob.indexOf(':');
    if (colon === -1) throw new Error('cipher: missing version prefix');
    const version = blob.slice(0, colon);
    if (version !== VERSION) throw new Error(`cipher: unsupported version ${version}`);

    const buf = Buffer.from(blob.slice(colon + 1), 'base64');
    if (buf.length < IV_LEN + TAG_LEN + 1) throw new Error('cipher: payload too short');

    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ct = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv(ALGO, this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  }
}

export function loadMasterKeyFromEnv(env?: NodeJS.ProcessEnv): Buffer {
  const raw = (env === undefined
    ? envBackedConfig().raw('ENCRYPTION_KEY') ?? ''
    : env.ENCRYPTION_KEY ?? '').trim();
  if (!raw) {
    throw new Error('ENCRYPTION_KEY is required (32 bytes, base64 or hex). See .env.example');
  }
  return decodeMasterKey(raw);
}

function decodeMasterKey(raw: string): Buffer {
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  // base64 / base64url — accept both
  const normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  let buf: Buffer;
  try {
    buf = Buffer.from(padded, 'base64');
  } catch {
    throw new Error('ENCRYPTION_KEY must be 64-char hex or 32-byte base64');
  }
  if (buf.length !== KEY_LEN) {
    throw new Error(`ENCRYPTION_KEY must decode to ${KEY_LEN} bytes (got ${buf.length})`);
  }
  return buf;
}
