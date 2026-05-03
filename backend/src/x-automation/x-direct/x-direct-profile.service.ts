import * as fs from 'fs';
import { Injectable } from '@nestjs/common';
import { XDirectBaseService } from './x-direct-base.service';
import type { DryRunFlag } from './x-direct.types';

interface ProfileFields {
  name?: string;
  bio?: string;
  location?: string;
  website?: string;
}

/**
 * Profile mutations on the live X session: text fields (name/bio/location/
 * website), avatar upload, banner upload. Avatar and banner share the same
 * /settings/profile flow with file-input index selection.
 */
@Injectable()
export class XDirectProfileService extends XDirectBaseService {
  async updateProfile(
    fields: ProfileFields,
    accountId?: string,
  ): Promise<{ ok: boolean; updated: string[] } & DryRunFlag> {
    if (this.isNoopMode()) {
      const updated = Object.keys(fields).filter((k) => fields[k as keyof ProfileFields] !== undefined);
      this.log.log(`[NoOp] updateProfile dry-run: ${JSON.stringify(updated)}`);
      return { ok: true, updated, dryRun: true };
    }
    return this.withSession('updateProfile', accountId, async (page, acctId) => {
      const updated: string[] = [];
      await page.goto('https://x.com/settings/profile', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.browser.assertSessionHealthy(page, acctId);
      await page.waitForTimeout(2_000);

      if (fields.name !== undefined) {
        const nameInput = page.locator(this.sel.profileNameInput).first();
        await nameInput.waitFor({ timeout: 10_000 });
        await nameInput.fill(fields.name);
        updated.push('name');
      }

      if (fields.bio !== undefined) {
        const bioInput = page.locator(this.sel.profileBioTextarea).first();
        await bioInput.waitFor({ timeout: 5_000 });
        await bioInput.fill(fields.bio);
        updated.push('bio');
      }

      if (fields.location !== undefined) {
        const locInput = page.locator(this.sel.profileLocationInput).first();
        await locInput.waitFor({ timeout: 5_000 });
        await locInput.fill(fields.location);
        updated.push('location');
      }

      if (fields.website !== undefined) {
        const webInput = page.locator(this.sel.profileWebsiteInput).first();
        await webInput.waitFor({ timeout: 5_000 });
        await webInput.fill(fields.website);
        updated.push('website');
      }

      if (updated.length > 0) {
        const saveBtn = page.getByRole('button', { name: /save/i }).first();
        await saveBtn.waitFor({ timeout: 5_000 });
        await saveBtn.click();
        await page.waitForTimeout(2_000);
      }

      return { ok: true, updated };
    });
  }

  async updateAvatar(filePath: string, accountId?: string): Promise<{ ok: boolean } & DryRunFlag> {
    return this.uploadProfileImage('avatar', filePath, accountId);
  }

  async updateBanner(filePath: string, accountId?: string): Promise<{ ok: boolean } & DryRunFlag> {
    return this.uploadProfileImage('banner', filePath, accountId);
  }

  private async uploadProfileImage(
    kind: 'avatar' | 'banner',
    filePath: string,
    accountId?: string,
  ): Promise<{ ok: boolean } & DryRunFlag> {
    if (this.isNoopMode()) {
      this.log.log(`[NoOp] update${kind === 'avatar' ? 'Avatar' : 'Banner'} dry-run: ${filePath}`);
      return { ok: true, dryRun: true };
    }
    if (!fs.existsSync(filePath)) {
      throw new Error(`${kind} file not found: ${filePath}`);
    }
    return this.withSession(`update${kind === 'avatar' ? 'Avatar' : 'Banner'}`, accountId, async (page, acctId) => {
      await page.goto('https://x.com/settings/profile', {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
      await this.browser.assertSessionHealthy(page, acctId);
      await page.waitForTimeout(2_000);

      // X exposes both file inputs side-by-side on the profile editor. Pick by
      // index (avatar = 0, banner = 1) and fall back to the first input if
      // only one is rendered.
      const fileInputs = page.locator(this.sel.profileFileInputs);
      const count = await fileInputs.count().catch(() => 0);
      if (count === 0) {
        throw new Error('No profile-image file inputs found on /settings/profile (UI may have changed)');
      }
      const target = kind === 'avatar' ? fileInputs.first() : (count > 1 ? fileInputs.nth(1) : fileInputs.first());
      await target.setInputFiles(filePath);

      // Crop modal Apply (X often shows a crop UI for both avatar and banner).
      const apply = page.locator(this.sel.profileApplyButton).first();
      try {
        await apply.waitFor({ timeout: 8_000 });
        await apply.click();
      } catch {
        // No crop modal — some uploads commit immediately.
      }

      const saveBtn = page.locator(this.sel.profileSaveButton).first();
      try {
        await saveBtn.waitFor({ timeout: 5_000 });
        await saveBtn.click();
      } catch {
        // Some flows persist immediately without a Save button.
      }
      await page.waitForTimeout(2_000);
      return { ok: true };
    });
  }
}
