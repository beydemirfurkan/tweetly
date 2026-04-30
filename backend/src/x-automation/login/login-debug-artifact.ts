import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { Page } from 'patchright';

import type { LoginJobFailureReason } from './login.types';

interface LoginDebugArtifactInput {
  page: Page;
  username: string;
  email?: string | null;
  password?: string | null;
  totpSecret?: string | null;
  reason: LoginJobFailureReason;
  detail: string;
  durationMs: number;
}

export interface LoginDebugArtifact {
  path: string;
}

export async function writeLoginDebugArtifact(input: LoginDebugArtifactInput): Promise<LoginDebugArtifact | null> {
  if ((process.env.LOGIN_DEBUG_ARTIFACTS ?? 'true').toLowerCase() === 'false') return null;

  const dir = loginDebugDir();
  await mkdir(dir, { recursive: true });

  const artifact = await captureSafeSnapshot(input);
  const filePath = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${safeFilePart(input.username)}-${input.reason}.json`);
  await writeFile(filePath, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  return { path: filePath };
}

export function redactLoginDebugText(text: string, values: Array<string | null | undefined>): string {
  let redacted = text;
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed || trimmed.length < 3) continue;
    redacted = redacted.replace(new RegExp(escapeRegExp(trimmed), 'gi'), '[redacted]');
  }
  return redacted
    .replace(/auth_token=([^;\s]+)/gi, 'auth_token=[redacted]')
    .replace(/ct0=([^;\s]+)/gi, 'ct0=[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=%-]+/gi, 'Bearer [redacted]')
    .replace(/\b\d{6}\b/g, '[redacted-code]');
}

async function captureSafeSnapshot(input: LoginDebugArtifactInput): Promise<Record<string, unknown>> {
  const secrets = [input.username, input.email, input.password, input.totpSecret];
  const page = input.page;
  const bodyText = await page.locator('body').innerText().catch(() => '');

  return {
    capturedAt: new Date().toISOString(),
    reason: input.reason,
    detail: redactLoginDebugText(input.detail, secrets),
    durationMs: input.durationMs,
    page: {
      url: redactLoginDebugText(page.url(), secrets),
      title: redactLoginDebugText(await page.title().catch(() => '?'), secrets),
      bodyText: truncate(redactLoginDebugText(bodyText.replace(/\s+/g, ' '), secrets), 2000),
      inputs: await safeInputs(page),
      buttons: await safeButtons(page, secrets),
    },
  };
}

async function safeInputs(page: Page): Promise<Array<Record<string, unknown>>> {
  return page
    .locator('input')
    .evaluateAll((els) =>
      els.slice(0, 20).map((e) => {
        const input = e as HTMLInputElement;
        return {
          type: input.type || null,
          name: input.name || null,
          autocomplete: input.autocomplete || null,
          testId: input.dataset.testid || null,
          valueLength: input.value.length,
        };
      }),
    )
    .catch(() => []);
}

async function safeButtons(page: Page, secrets: Array<string | null | undefined>): Promise<string[]> {
  const texts = await page
    .locator('button, [role="button"]')
    .evaluateAll((els) => els.slice(0, 20).map((e) => (e.textContent ?? '').trim()).filter(Boolean))
    .catch(() => []);
  return texts.map((text) => redactLoginDebugText(text, secrets));
}

function loginDebugDir(): string {
  const configured = process.env.LOGIN_DEBUG_DIR?.trim();
  if (configured) return configured;

  const dataDir = process.env.DATA_DIR?.trim() || path.resolve(process.cwd(), 'data');
  return path.join(dataDir, 'errors', 'login');
}

function safeFilePart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 48) || 'unknown';
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}...`;
}
